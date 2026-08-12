"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  getViewerProductsSold,
  getViewerSalesByTerminal,
  type ViewerData,
  type ViewerPeriodPreset,
  type ViewerTerminalSaleRow,
} from "@/app/produtos-vendidos/actions";
import { createClient } from "@/lib/supabase/client";
import { matchesSearch } from "@/lib/text/normalize";
import { classifySyncFreshness, SYNC_FRESHNESS_LABELS } from "@/lib/integrations/sync-status";
import { SYNC_BROADCAST_CHANNEL, SYNC_BROADCAST_EVENT, type SyncCompletedPayload } from "@/lib/integrations/realtime-broadcast";
import { AlertTriangle, ChevronDown, ChevronUp, Search, Store, WifiOff, X } from "lucide-react";

const PERIODS: { value: ViewerPeriodPreset; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "7d", label: "Últimos 7 dias" },
];

const REALTIME_DEBOUNCE_MS = 800;
const POLL_FALLBACK_MS = 60000;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function formatDayLabel(dateStr: string) {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}
function formatClock(date: Date) {
  return date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

type ConnectionStatus = "connecting" | "live" | "polling" | "offline" | "error";

/**
 * "Produtos vendidos" do perfil restrito (Visualizador de produtos) —
 * mobile-first, sem gaveta, sem gráfico. Período (Hoje/Ontem/7 dias),
 * busca, loja (só quando há mais de uma autorizada) e uma lista simples.
 * Atualiza sozinha via Realtime quando um pedido/item muda numa loja
 * autorizada — o RLS garante que eventos de outras lojas nunca chegam aqui.
 */
export function ProductsViewerTab() {
  const [view, setView] = useState<"produtos" | "terminal">("produtos");
  const [period, setPeriod] = useState<ViewerPeriodPreset>("hoje");
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ViewerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [terminalRows, setTerminalRows] = useState<ViewerTerminalSaleRow[] | null>(null);
  const [terminalOptions, setTerminalOptions] = useState<string[]>([]);
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [customDate, setCustomDate] = useState<string>("");
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null);

  const fetchingRef = useRef(false);
  const selectedStoresKey = selectedStores.join(",");

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const result = await getViewerProductsSold({ periodPreset: period, storeIds: selectedStores });
      setData(result);
      setLastFetchedAt(new Date());
      setErrored(false);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedStoresKey]);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  // Aba "Por terminal" busca sob demanda, só quando selecionada — evita
  // carregar dado que a maioria dos acessos nunca vai ver. Data específica
  // (customDate) substitui o período rápido; terminal filtra no servidor.
  useEffect(() => {
    if (view !== "terminal") return;
    let cancelled = false;
    async function load() {
      setTerminalLoading(true);
      try {
        const result = await getViewerSalesByTerminal({
          periodPreset: period,
          customDate: customDate || null,
          storeIds: selectedStores,
          terminal: selectedTerminal,
        });
        if (!cancelled) {
          setTerminalRows(result.rows);
          setTerminalOptions(result.terminalOptions);
        }
      } finally {
        if (!cancelled) setTerminalLoading(false);
      }
    }
    const timer = setTimeout(load, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, period, selectedStoresKey, customDate, selectedTerminal]);

  // Realtime: nada de polling contínuo — carrega uma vez, mantém uma
  // assinatura viva, e só refaz a consulta quando um evento real chega (ou
  // como rede de segurança, se a conexão em tempo real cair).
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const timer = setTimeout(() => setStatus("offline"), 0);
      return () => clearTimeout(timer);
    }

    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function scheduleRefresh() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, REALTIME_DEBOUNCE_MS);
    }

    const channel = supabase
      .channel("products-viewer-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleRefresh)
      .subscribe((subStatus) => {
        if (subStatus === "SUBSCRIBED") {
          setStatus("live");
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        } else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT" || subStatus === "CLOSED") {
          setStatus("polling");
          if (!pollTimer) pollTimer = setInterval(refresh, POLL_FALLBACK_MS);
        }
      });

    // Broadcast dedicado do fim de uma sincronização (ver
    // broadcastSyncCompleted) — chega mesmo quando não há nenhuma linha
    // nova (ex.: "cheguei a checar e não tinha pedido novo"), o que os
    // eventos `postgres_changes` acima não cobrem.
    const syncChannel = supabase
      .channel(SYNC_BROADCAST_CHANNEL)
      .on("broadcast", { event: SYNC_BROADCAST_EVENT }, (message) => {
        const payload = message.payload as SyncCompletedPayload;
        const relevant = selectedStores.length === 0 || payload.storeIds.some((id) => selectedStores.includes(id));
        if (relevant) scheduleRefresh();
      })
      .subscribe();

    const fallbackTimer = setTimeout(() => {
      setStatus((current) => {
        if (current === "live") return current;
        if (!pollTimer) pollTimer = setInterval(refresh, POLL_FALLBACK_MS);
        return "polling";
      });
    }, 5000);

    function handleOffline() {
      setStatus("offline");
    }
    function handleOnline() {
      setStatus("connecting");
      refresh();
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (pollTimer) clearInterval(pollTimer);
      clearTimeout(fallbackTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(channel);
      supabase.removeChannel(syncChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, selectedStoresKey]);

  const filteredSummaries = useMemo(() => {
    const summaries = data?.summaries ?? [];
    if (!search.trim()) return summaries;
    return summaries.filter((s) => matchesSearch(s.productName, search));
  }, [data, search]);

  const filteredTerminalRows = useMemo(() => {
    const rows = terminalRows ?? [];
    if (!search.trim()) return rows;
    return rows.filter((r) => matchesSearch(r.productName, search));
  }, [terminalRows, search]);

  const totalUnits = filteredSummaries.reduce((sum, s) => sum + s.quantity, 0);
  const hasMultipleStores = (data?.storeOptions.length ?? 0) > 1;
  const storeLabel =
    !data || data.storeOptions.length === 0
      ? "—"
      : data.storeOptions.length === 1
        ? data.storeOptions[0].name
        : selectedStores.length === 0 || selectedStores.length === data.storeOptions.length
          ? "Todas as lojas permitidas"
          : `${selectedStores.length} loja(s) selecionada(s)`;
  const isMultiDay = period === "7d";
  const maxQuantity = Math.max(1, ...filteredSummaries.map((s) => s.quantity));
  const noSearchResults = search.trim().length > 0 && filteredSummaries.length === 0 && (data?.summaries.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{storeLabel}</p>
        <ConnectionBadge status={status} lastFetchedAt={lastFetchedAt} />
      </div>

      {data && (() => {
        const freshness = classifySyncFreshness(data.lastDataReceivedAt);
        if (freshness === "atualizado") return null;
        return <p className="text-xs font-medium text-destructive">{SYNC_FRESHNESS_LABELS[freshness]}</p>;
      })()}

      <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1">
        <button
          type="button"
          onClick={() => setView("produtos")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "produtos" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Produtos
        </button>
        <button
          type="button"
          onClick={() => setView("terminal")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "terminal" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Por terminal
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                setPeriod(p.value);
                if (view === "terminal") setCustomDate("");
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p.value && !customDate ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {view === "terminal" && (
          <Input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="h-9 w-36 text-sm"
            aria-label="Data específica"
          />
        )}

        {view === "terminal" && terminalOptions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              {selectedTerminal ? `Terminal ${selectedTerminal}` : "Terminal"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSelectedTerminal(null)}>Todos os terminais</DropdownMenuItem>
              {terminalOptions.map((t) => (
                <DropdownMenuItem key={t} onClick={() => setSelectedTerminal(t)}>
                  Terminal {t}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {hasMultipleStores && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Store className="size-3.5" />
              Loja
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(data?.storeOptions ?? []).map((s) => (
                <DropdownMenuCheckboxItem
                  key={s.id}
                  checked={selectedStores.length === 0 ? true : selectedStores.includes(s.id)}
                  onCheckedChange={(checked) => {
                    setSelectedStores((prev) => {
                      const base = prev.length === 0 ? (data?.storeOptions ?? []).map((o) => o.id) : prev;
                      const next = checked ? [...new Set([...base, s.id])] : base.filter((id) => id !== s.id);
                      return next.length === (data?.storeOptions ?? []).length ? [] : next;
                    });
                  }}
                >
                  {s.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-8 pr-8" />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {view === "produtos" && (
        <p className="text-sm text-muted-foreground">
          Total de unidades vendidas: <span className="font-semibold text-foreground tabular-nums">{totalUnits}</span>
        </p>
      )}

      {view === "produtos" && (loading && !data ? (
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : errored ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="size-6 text-danger" />
            <p className="text-sm font-medium">Não foi possível carregar os produtos vendidos.</p>
            <Button size="sm" variant="outline" onClick={refresh}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : noSearchResults ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm font-medium">Nenhum produto encontrado para &quot;{search}&quot;.</p>
            <button type="button" onClick={() => setSearch("")} className="text-sm font-medium text-primary hover:underline">
              Limpar pesquisa
            </button>
          </CardContent>
        </Card>
      ) : filteredSummaries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum produto vendido no período selecionado.</CardContent>
        </Card>
      ) : (
        <div className="divide-y rounded-lg border">
          <div className="flex items-center gap-2 bg-muted/40 px-2.5 py-2 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Produto</span>
            <span className="w-24 text-right">Unidades</span>
            <span className="w-14 text-right">Hora</span>
            <span className="w-20 text-right">Data</span>
            {isMultiDay && <span className="w-6" />}
          </div>
          {filteredSummaries.map((row, i) => {
            const isExpanded = expanded === row.productName;
            return (
              <div key={row.productName}>
                <button
                  type="button"
                  disabled={!isMultiDay}
                  onClick={() => isMultiDay && setExpanded(isExpanded ? null : row.productName)}
                  className={`flex w-full items-center gap-2 px-2.5 py-2.5 text-left text-sm transition-colors ${
                    isMultiDay ? "hover:bg-muted" : ""
                  } ${isExpanded ? "bg-muted" : i % 2 === 1 ? "bg-muted/20" : "bg-card"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-medium">{row.productName}</span>
                  </span>
                  <span className="flex w-24 shrink-0 items-center justify-end gap-1.5">
                    <span className="hidden h-1.5 w-8 overflow-hidden rounded-full bg-muted sm:block">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (row.quantity / maxQuantity) * 100)}%` }} />
                    </span>
                    <span className="tabular-nums">{row.quantity} un.</span>
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatTime(row.lastSoldAt)}</span>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatDate(row.lastSoldAt)}</span>
                  {isMultiDay && (
                    <span className="w-6 shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </span>
                  )}
                </button>
                {isMultiDay && isExpanded && (
                  <div className="space-y-1 border-t bg-muted/20 px-3 py-2.5 text-xs">
                    {row.byDay.map((d) => (
                      <div key={d.date} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{formatDayLabel(d.date)}:</span>
                        <span className="font-medium tabular-nums">{d.quantity} unidades</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {view === "terminal" &&
        (terminalLoading && !terminalRows ? (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filteredTerminalRows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma venda no período selecionado.</CardContent>
          </Card>
        ) : (
          <div className="divide-y rounded-lg border">
            <div className="flex items-center gap-2 bg-muted/40 px-2.5 py-2 text-xs font-medium text-muted-foreground">
              <span className="flex-1">Produto</span>
              <span className="w-14 text-right">Hora</span>
              <span className="w-20 text-right">Terminal</span>
            </div>
            {filteredTerminalRows.map((row, i) => (
              <div
                key={`${row.orderedAt}-${row.productName}-${i}`}
                className={`flex items-center gap-2 px-2.5 py-2.5 text-sm ${i % 2 === 1 ? "bg-muted/20" : "bg-card"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 font-medium">
                    {row.quantity > 1 ? `${row.quantity}x ` : ""}
                    {row.productName}
                  </span>
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{formatTime(row.orderedAt)}</span>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{row.terminal ?? "—"}</span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function ConnectionBadge({ status, lastFetchedAt }: { status: ConnectionStatus; lastFetchedAt: Date | null }) {
  if (status === "offline") {
    return (
      <Badge variant="destructive" className="gap-1">
        <WifiOff className="size-3" /> Sem conexão
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" /> Falha na atualização
      </Badge>
    );
  }
  if (status === "live") {
    return (
      <Badge className="gap-1 bg-success">
        {lastFetchedAt ? `Ao vivo · ${formatClock(lastFetchedAt)}` : "Ao vivo"}
      </Badge>
    );
  }
  if (status === "polling") {
    return <Badge variant="secondary">{lastFetchedAt ? `Atualizado às ${formatClock(lastFetchedAt)}` : "Reconectando..."}</Badge>;
  }
  return <Badge variant="outline">Sincronizando...</Badge>;
}
