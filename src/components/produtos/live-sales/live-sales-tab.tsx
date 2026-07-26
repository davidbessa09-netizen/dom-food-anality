"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SingleSelectFilter } from "@/components/filters/single-select-filter";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SalesBarChart } from "@/components/charts/sales-bar-chart";
import { ProductAutocomplete } from "./product-autocomplete";
import { ProductDetailDrawer } from "./product-detail-drawer";
import { LiveSalesTable } from "./live-sales-table";
import { createClient } from "@/lib/supabase/client";
import { getLiveSalesData, exportLiveSalesCsv, type LiveSalesData, type LiveSalesFilters } from "@/app/(dashboard)/produtos/live-sales-actions";
import {
  filterByStatusMode,
  buildProductSalesSummaries,
  buildOverallIndicators,
  buildGrowthComparison,
  type SaleStatusMode,
  type ProductSalesSummary,
} from "@/lib/metrics/live-sales";
import { Info, Loader2, Pause, Play, RefreshCw, TrendingDown, TrendingUp, Wifi, WifiOff } from "lucide-react";
import { Package, ShoppingBag, Wallet, XCircle } from "lucide-react";

const POLL_INTERVAL_MS = 45000;
const REALTIME_DEBOUNCE_MS = 800;

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
function timeAgo(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours}h`;
}

const MODE_OPTIONS: { value: SaleStatusMode; label: string }[] = [
  { value: "confirmadas", label: "Confirmadas" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "canceladas", label: "Canceladas" },
];

export function LiveSalesTab() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const brandId = searchParams.get("brand");
  const storesRaw = searchParams.get("stores");
  const storeIds = storesRaw ? storesRaw.split(",").filter(Boolean) : [];
  const channel = searchParams.get("channel");
  const categoryId = searchParams.get("category");
  const periodPreset = searchParams.get("period") ?? "hoje";
  const customFrom = searchParams.get("from") ?? undefined;
  const customTo = searchParams.get("to") ?? undefined;
  const fulfillment = searchParams.get("fulfillment");
  const payment = searchParams.get("payment");
  const product = searchParams.get("product");
  const mode = (searchParams.get("mode") as SaleStatusMode | null) ?? "confirmadas";

  const filters: LiveSalesFilters = useMemo(
    () => ({
      brandId,
      storeIds,
      channel,
      categoryId,
      periodPreset,
      customFrom,
      customTo,
      payment,
      fulfillment,
      status: null,
      product,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandId, storesRaw, channel, categoryId, periodPreset, customFrom, customTo, payment, fulfillment, product]
  );

  const [data, setData] = useState<LiveSalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "polling">("connecting");
  const [detailProduct, setDetailProduct] = useState<ProductSalesSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isStale, setIsStale] = useState(false);

  const fetchingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const result = await getLiveSalesData(filters);
      setData(result);
      setLastFetchedAt(new Date());
      setIsStale(result.lastSyncedAt ? Date.now() - new Date(result.lastSyncedAt).getTime() > 30 * 60 * 1000 : false);
      setErrored(false);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  // Realtime: escuta mudanças reais em orders/order_items (ver migration
  // 0012_realtime_orders.sql). Se não conseguir se inscrever, cai pra
  // polling seguro a cada 45s — nunca reprocessa incrementalmente (sempre
  // busca o recorte inteiro de novo), então não há risco de duplicar pedido.
  useEffect(() => {
    if (paused) return;
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function scheduleRefresh() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, REALTIME_DEBOUNCE_MS);
    }

    const channelSub = supabase
      .channel("live-sales-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("live");
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnectionStatus("polling");
          if (!pollTimer) pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
        }
      });

    // Fallback: se em 5s o Realtime não confirmar inscrição, já liga o polling.
    const fallbackTimer = setTimeout(() => {
      setConnectionStatus((current) => {
        if (current !== "live" && !pollTimer) pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
        return current === "live" ? current : "polling";
      });
    }, 5000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (pollTimer) clearInterval(pollTimer);
      clearTimeout(fallbackTimer);
      supabase.removeChannel(channelSub);
    };
  }, [paused, refresh]);

  function commitParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  }

  const confirmedEvents = useMemo(() => filterByStatusMode(data?.currentEvents ?? [], "confirmadas"), [data]);
  const cancelledEvents = useMemo(() => filterByStatusMode(data?.currentEvents ?? [], "canceladas"), [data]);
  const modeEvents = useMemo(() => filterByStatusMode(data?.currentEvents ?? [], mode), [data, mode]);
  const previousModeEvents = useMemo(() => filterByStatusMode(data?.previousEvents ?? [], mode), [data, mode]);

  const indicators = useMemo(() => buildOverallIndicators(confirmedEvents, cancelledEvents), [confirmedEvents, cancelledEvents]);
  const summaries = useMemo(() => buildProductSalesSummaries(modeEvents), [modeEvents]);
  const previousSummaries = useMemo(() => buildProductSalesSummaries(previousModeEvents), [previousModeEvents]);
  const { growing, declining } = useMemo(() => buildGrowthComparison(summaries, previousSummaries), [summaries, previousSummaries]);

  const selectedSummary = product ? summaries.find((s) => s.productName === product) ?? null : null;
  const totalRevenueForShare = summaries.reduce((sum, s) => sum + s.revenue, 0);

  const byHour = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const e of modeEvents) {
      const hour = Number(new Date(e.orderedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).slice(0, 2));
      buckets.set(hour, (buckets.get(hour) ?? 0) + e.quantity);
    }
    return Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}h`, revenue: buckets.get(hour) ?? 0 }));
  }, [modeEvents]);

  const recentFeed = useMemo(() => [...modeEvents].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)).slice(0, 20), [modeEvents]);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportLiveSalesCsv({ filters });
      const blob = new Blob([`﻿${result.csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `produtos-vendidos-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${result.count} linha(s) exportada(s).`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {paused ? (
              <Badge variant="secondary" className="gap-1">
                <Pause className="size-3" /> Pausado
              </Badge>
            ) : connectionStatus === "live" ? (
              <Badge className="gap-1 bg-success">
                <Wifi className="size-3" /> Ao vivo
              </Badge>
            ) : connectionStatus === "polling" ? (
              <Badge variant="secondary" className="gap-1">
                <RefreshCw className="size-3" /> Atualização periódica
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="size-3 animate-spin" /> Conectando
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {lastFetchedAt ? `Última atualização: ${timeAgo(lastFetchedAt)}` : "Carregando..."}
            </span>
            {isStale && (
              <Tooltip>
                <TooltipTrigger render={<span className="cursor-help" />}>
                  <Badge variant="destructive" className="gap-1">
                    <WifiOff className="size-3" /> Sincronização desatualizada
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64">
                  A última sincronização com a plataforma de origem foi há mais de 30min. &quot;Ao vivo&quot;
                  reflete o banco instantaneamente, mas o banco só recebe pedido novo quando o cron de
                  sincronização roda.
                </TooltipContent>
              </Tooltip>
            )}
            {errored && (
              <Badge variant="destructive" className="gap-1">
                <WifiOff className="size-3" /> Conexão interrompida
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} /> Atualizar agora
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
              {paused ? (
                <>
                  <Play className="size-3.5" /> Retomar
                </>
              ) : (
                <>
                  <Pause className="size-3.5" /> Pausar atualizações
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Marca, loja, canal, categoria, período e tipo usam os mesmos filtros compartilhados no
          topo da página. Os campos abaixo são específicos desta aba.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ProductAutocomplete options={data?.productOptions ?? []} onSelect={(name) => commitParams({ product: name })} />
          <SingleSelectFilter
            paramKey="payment"
            options={(data?.currentEvents ?? [])
              .map((e) => e.paymentMethod)
              .filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)
              .map((v) => ({ value: v, label: v }))}
            current={payment}
            allLabel="Todos os pagamentos"
            className="w-48"
          />
          {product && (
            <Badge variant="secondary" className="gap-1">
              Produto: {product}
              <button type="button" onClick={() => commitParams({ product: null })} aria-label="Remover filtro de produto">
                ×
              </button>
            </Badge>
          )}
          {(product || payment) && (
            <Button size="sm" variant="ghost" onClick={() => commitParams({ product: null, payment: null })}>
              Limpar filtros
            </Button>
          )}
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1">
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => commitParams({ mode: m.value === "confirmadas" ? null : m.value })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === m.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Unidades vendidas"
              definition="Soma real da quantidade de cada item vendido (não o número de pedidos), no modo e filtros selecionados."
              basis={`Modo: ${MODE_OPTIONS.find((m) => m.value === mode)?.label}`}
              value={String(indicators.unitsSold)}
              icon={<Package className="size-4" />}
              state="neutral"
            />
            <KpiCard
              label="Pedidos concluídos"
              definition="Contagem de pedidos DISTINTOS com status concluído no recorte — nunca confundido com unidades vendidas."
              basis="Pedidos distintos, status concluído"
              value={String(indicators.completedOrders)}
              icon={<ShoppingBag className="size-4" />}
              state="neutral"
            />
            <KpiCard
              label="Faturamento dos produtos"
              definition="Soma do valor dos itens (sem adicionais) nos pedidos confirmados do recorte."
              basis="Itens principais, pedidos concluídos"
              value={formatCurrency(indicators.revenue)}
              icon={<Wallet className="size-4" />}
              state="neutral"
            />
            <KpiCard
              label="Cancelados"
              definition="Soma da quantidade de itens em pedidos cancelados no recorte."
              basis="Itens em pedidos cancelados"
              value={String(indicators.cancelledUnits)}
              icon={<XCircle className="size-4" />}
              state={indicators.cancelledUnits > 0 ? "critical" : "positive"}
            />
          </div>

          {selectedSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{selectedSummary.productName}</CardTitle>
                <CardDescription>Resumo do produto no escopo e período filtrados.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Unidades vendidas</p>
                  <p className="text-lg font-semibold tabular-nums">{selectedSummary.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pedidos</p>
                  <p className="text-lg font-semibold tabular-nums">{selectedSummary.orders}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Faturamento</p>
                  <p className="text-lg font-semibold tabular-nums">{formatCurrency(selectedSummary.revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Preço médio</p>
                  <p className="text-lg font-semibold tabular-nums">{selectedSummary.avgPrice === null ? "—" : formatCurrency(selectedSummary.avgPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Participação no faturamento</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {totalRevenueForShare > 0 ? formatPercent(selectedSummary.revenue / totalRevenueForShare) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Última venda</p>
                  <p className="text-sm font-medium">{new Date(selectedSummary.lastSoldAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Loja com mais vendas</p>
                  <p className="text-sm font-medium">{selectedSummary.topStoreName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Canal com mais vendas</p>
                  <p className="text-sm font-medium">{selectedSummary.topChannel ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolução por hora</CardTitle>
              <CardDescription>Unidades vendidas por hora do dia (fuso America/Sao_Paulo), modo {MODE_OPTIONS.find((m) => m.value === mode)?.label.toLowerCase()}.</CardDescription>
            </CardHeader>
            <CardContent>
              <SalesBarChart data={byHour} height={200} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vendas acontecendo agora</CardTitle>
              <CardDescription>{recentFeed.length} venda(s) mais recente(s) no recorte selecionado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {recentFeed.map((e, i) => (
                <div
                  key={`${e.orderId}-${i}`}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
                >
                  <span className="whitespace-nowrap text-muted-foreground">
                    {new Date(e.orderedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="font-medium">{e.productName}</span>
                  <span>{e.quantity} un.</span>
                  <span className="truncate">{e.storeName}</span>
                  <span className="truncate">{e.channel}</span>
                  <span className="tabular-nums">{formatCurrency(e.totalPrice)}</span>
                  <Badge variant="outline" className="ml-auto whitespace-nowrap">
                    {e.status}
                  </Badge>
                  <span className="whitespace-nowrap font-mono text-muted-foreground">#{e.orderId.slice(0, 8)}</span>
                </div>
              ))}
              {recentFeed.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma venda no recorte selecionado.</p>}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                  <TrendingUp className="size-4 text-success" /> Produtos em crescimento
                </CardTitle>
                <CardDescription>Maior aumento de unidades vs. o período anterior de mesma duração.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {growing.slice(0, 8).map((r) => (
                  <div key={r.productName} className="flex items-center justify-between text-sm">
                    <span className="truncate">{r.productName}</span>
                    <Badge className="bg-success">+{formatPercent(r.growth)}</Badge>
                  </div>
                ))}
                {growing.length === 0 && <p className="text-sm text-muted-foreground">Sem dados suficientes pra comparar.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-base">
                  <TrendingDown className="size-4 text-danger" /> Produtos em queda
                </CardTitle>
                <CardDescription>Maior redução de unidades vs. o período anterior — exclui produtos sem histórico anterior.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {declining.slice(0, 8).map((r) => (
                  <div key={r.productName} className="flex items-center justify-between text-sm">
                    <span className="truncate">{r.productName}</span>
                    <Badge variant="destructive">{formatPercent(r.growth)}</Badge>
                  </div>
                ))}
                {declining.length === 0 && <p className="text-sm text-muted-foreground">Sem dados suficientes pra comparar.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Produtos vendidos</CardTitle>
                  <CardDescription>
                    {summaries.length} produto(s) diferentes no recorte.{" "}
                    {data?.truncated && (
                      <Tooltip>
                        <TooltipTrigger render={<span className="cursor-help underline" />}>
                          Amostra pode estar limitada
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-64">
                          <Info className="mb-1 size-3.5" /> O recorte tem mais linhas do que o teto de segurança da
                          consulta — refine os filtros (loja, canal ou período) pra ver o total exato.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                  {exporting ? "Exportando..." : "Exportar CSV"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <LiveSalesTable
                summaries={summaries}
                previousSummaries={previousSummaries}
                categoryByProductName={new Map()}
                onViewDetails={(s) => setDetailProduct(s)}
              />
            </CardContent>
          </Card>
        </>
      )}

      <ProductDetailDrawer
        open={detailProduct !== null}
        onOpenChange={(o) => !o && setDetailProduct(null)}
        summary={detailProduct}
        events={data?.currentEvents ?? []}
        onFilterPage={(name) => {
          commitParams({ product: name });
          setDetailProduct(null);
        }}
      />
    </div>
  );
}
