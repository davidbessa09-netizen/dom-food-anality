"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelectFilter } from "@/components/filters/multi-select-filter";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { LiveSalesTable } from "./live-sales-table";
import { exportLiveSalesCsv } from "@/app/(dashboard)/produtos/live-sales-actions";
import { getProductsSoldSummary, syncStoresNow, type ProductsSoldData } from "@/app/(dashboard)/produtos/products-sold-actions";
import { matchesSearch } from "@/lib/text/normalize";
import { classifySyncFreshness, SYNC_FRESHNESS_LABELS } from "@/lib/integrations/sync-status";
import { SYNC_BROADCAST_CHANNEL, SYNC_BROADCAST_EVENT, type SyncCompletedPayload } from "@/lib/integrations/realtime-broadcast";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw, Download, AlertTriangle, Search, X } from "lucide-react";

const QUICK_PERIODS: { value: string; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
];

const WEEKDAY_OPTIONS = [
  { value: null, label: "Todos" },
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * "Produtos vendidos" — versão enxuta inspirada no relatório de itens do
 * Anota AI: período, busca de produto, loja (só quando há mais de uma) e
 * uma lista simples ordenada por quantidade. Sem abas internas, sem
 * gráficos, sem cards de indicador, sem gaveta lateral — filtros ficam
 * sempre visíveis na própria página e o detalhe do produto expande inline.
 */
export function LiveSalesTab() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const storesRaw = searchParams.get("stores");
  const storeIds = storesRaw ? storesRaw.split(",").filter(Boolean) : [];
  const periodPreset = searchParams.get("period") ?? "30d";
  const customFrom = searchParams.get("from") ?? undefined;
  const customTo = searchParams.get("to") ?? undefined;
  const weekdayRaw = searchParams.get("weekday");
  const weekday = weekdayRaw !== null ? Number(weekdayRaw) : null;

  // "Hoje"/"Ontem" (ou um intervalo personalizado com from===to) são
  // períodos de um dia só — o filtro por dia da semana só faz sentido
  // quando o período selecionado abrange mais de um dia.
  const isSingleDay = customFrom && customTo ? customFrom === customTo : periodPreset === "hoje" || periodPreset === "ontem";
  const isMultiDay = !isSingleDay;

  const [data, setData] = useState<ProductsSoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Busca é estado local puro, derivado da lista já carregada — não passa
  // pela URL nem por uma nova consulta ao servidor, então sobrevive
  // intacta a qualquer refresh() (inclusive depois de sincronizar).
  const [searchInput, setSearchInput] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getProductsSoldSummary({ storeIds, periodPreset, customFrom, customTo, product: null, weekday });
      setData(result);
      setErrored(false);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesRaw, periodPreset, customFrom, customTo, weekday]);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  // Atualização em tempo real quando a sincronização automática (a cada
  // 5min) termina — sem polling: só refaz a consulta com os MESMOS filtros
  // de período/loja já aplicados quando o evento chega e é relevante pro
  // escopo de lojas atual (ver broadcastSyncCompleted).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(SYNC_BROADCAST_CHANNEL)
      .on("broadcast", { event: SYNC_BROADCAST_EVENT }, (message) => {
        const payload = message.payload as SyncCompletedPayload;
        const relevant = storeIds.length === 0 || payload.storeIds.some((id) => storeIds.includes(id));
        if (relevant) refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesRaw, refresh]);

  function commitParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  }

  function selectQuickPeriod(preset: string) {
    commitParams({ period: preset, from: null, to: null, weekday: null });
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncStoresNow(storeIds);
      await refresh();
      if (result.ok) {
        toast.success("Dados atualizados com sucesso");
      } else {
        toast.error(result.errors[0] ?? "Falha ao sincronizar — tente novamente.");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportLiveSalesCsv({
        filters: {
          brandId: null,
          storeIds,
          channel: null,
          categoryId: null,
          periodPreset,
          customFrom,
          customTo,
          payment: null,
          fulfillment: null,
          status: null,
          product: null,
          active: null,
          hasPrice: null,
          itemType: "principal",
        },
      });
      const blob = new Blob([`﻿${result.csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `produtos-vendidos-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const hasMultipleStores = (data?.storeOptions.length ?? 0) > 1;

  // Lista filtrada derivada da lista original — nunca modifica os dados
  // carregados, só decide o que é exibido. Também casa pelo nome de
  // qualquer variação/correspondência aprovada do produto (ver
  // variantsByProduct), não só pelo nome canônico exibido na linha.
  const filteredSummaries = useMemo(() => {
    const summaries = data?.summaries ?? [];
    if (!searchInput.trim()) return summaries;
    return summaries.filter((s) => {
      if (matchesSearch(s.productName, searchInput)) return true;
      const variants = data?.variantsByProduct[s.productName] ?? [];
      return variants.some((v) => matchesSearch(v.originalName, searchInput));
    });
  }, [data, searchInput]);

  const totalUnits = filteredSummaries.reduce((sum, s) => sum + s.quantity, 0);
  const hasSearch = searchInput.trim().length > 0;
  const noSearchResults = hasSearch && filteredSummaries.length === 0 && (data?.summaries.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Produtos vendidos</h2>
          <p className="text-sm text-muted-foreground">Consulte os produtos e as quantidades vendidas no período selecionado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-right">
          <div className="text-xs text-muted-foreground">
            Última sincronização:
            <br />
            {formatSyncedAt(data?.lastSyncedAt ?? null)}
            {data?.lastSyncedAt !== undefined && (
              <>
                <br />
                <span
                  className={
                    classifySyncFreshness(data?.lastSyncedAt ?? null) === "atualizado"
                      ? "text-muted-foreground"
                      : "font-medium text-destructive"
                  }
                >
                  {SYNC_FRESHNESS_LABELS[classifySyncFreshness(data?.lastSyncedAt ?? null)]}
                </span>
              </>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="bg-[color:var(--dom-gold)] text-white hover:bg-[color:var(--dom-gold-hover)]"
          >
            <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleExport} disabled={exporting}>
            <Download className="size-3.5" />
            {exporting ? "Exportando..." : "Exportar"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1">
          {QUICK_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => selectQuickPeriod(p.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                !customFrom && periodPreset === p.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <DateRangePicker from={customFrom} to={customTo} />

        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 pr-8"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {hasMultipleStores && (
          <MultiSelectFilter
            paramKey="stores"
            options={(data?.storeOptions ?? []).map((s) => ({ value: s.id, label: s.name }))}
            selected={storeIds}
            placeholder="Todas as lojas"
            searchPlaceholder="Buscar loja..."
          />
        )}
      </div>

      {isMultiDay && (
        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1">
          {WEEKDAY_OPTIONS.map((w) => (
            <button
              key={w.label}
              type="button"
              onClick={() => commitParams({ weekday: w.value === null ? null : String(w.value) })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                weekday === w.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Total de unidades vendidas: <span className="font-semibold text-foreground tabular-nums">{totalUnits}</span>
      </p>

      {loading && !data ? (
        <div className="space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : errored ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="size-6 text-danger" />
            <p className="text-sm font-medium">Não foi possível carregar os produtos vendidos.</p>
            <p className="text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : noSearchResults ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm font-medium">Nenhum produto encontrado para &quot;{searchInput}&quot;.</p>
            <button type="button" onClick={() => setSearchInput("")} className="text-sm font-medium text-primary hover:underline">
              Limpar pesquisa
            </button>
          </CardContent>
        </Card>
      ) : data && data.summaries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-medium">Nenhum produto vendido no período selecionado.</p>
            <p className="text-sm text-muted-foreground">Tente escolher outra data ou sincronizar os dados.</p>
            <Button
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="bg-[color:var(--dom-gold)] text-white hover:bg-[color:var(--dom-gold-hover)]"
          >
              <RefreshCw className={syncing ? "size-3.5 animate-spin" : "size-3.5"} />
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <LiveSalesTable summaries={filteredSummaries} events={data?.events ?? []} variantsByProduct={data?.variantsByProduct ?? {}} />
      )}
    </div>
  );
}
