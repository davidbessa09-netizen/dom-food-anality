"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SingleSelectFilter } from "@/components/filters/single-select-filter";
import { MultiSelectFilter } from "@/components/filters/multi-select-filter";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SalesBarChart } from "@/components/charts/sales-bar-chart";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { ProductAutocomplete } from "./product-autocomplete";
import { ProductDetailDrawer } from "./product-detail-drawer";
import { OrderItemsDrawer } from "./order-items-drawer";
import { LiveSalesTable } from "./live-sales-table";
import { createClient } from "@/lib/supabase/client";
import {
  getLiveSalesData,
  exportLiveSalesCsv,
  type LiveSalesData,
  type LiveSalesFilters,
  type ItemTypeFilter,
} from "@/app/(dashboard)/produtos/live-sales-actions";
import {
  filterByStatusMode,
  buildProductSalesSummaries,
  buildOverallIndicators,
  buildGrowthComparison,
  groupEventsByOrder,
  type SaleStatusMode,
  type ProductSalesSummary,
  type OrderFeedGroup,
} from "@/lib/metrics/live-sales";
import { CHANNEL_OPTIONS, FULFILLMENT_OPTIONS } from "@/lib/filters/types";
import type { PeriodPreset } from "@/lib/dates/period";
import { Loader2, Pause, Play, RefreshCw, SlidersHorizontal, TrendingDown, TrendingUp, Wifi, WifiOff, XCircle } from "lucide-react";
import { Package, ShoppingBag, Wallet } from "lucide-react";

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

const ACTIVE_OPTIONS = [
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" },
];
const HAS_PRICE_OPTIONS = [
  { value: "com", label: "Com preço cadastrado" },
  { value: "sem", label: "Sem preço cadastrado" },
];
const ITEM_TYPE_OPTIONS: { value: ItemTypeFilter; label: string }[] = [
  { value: "principal", label: "Só produto principal" },
  { value: "adicional", label: "Só adicional" },
  { value: "all", label: "Principal + adicional" },
];

export function LiveSalesTab({ brands = [] }: { brands?: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const brandId = searchParams.get("brand");
  const storesRaw = searchParams.get("stores");
  const storeIds = storesRaw ? storesRaw.split(",").filter(Boolean) : [];
  const channel = searchParams.get("channel");
  const categoryId = searchParams.get("category");
  const periodPreset = (searchParams.get("period") ?? "hoje") as PeriodPreset;
  const customFrom = searchParams.get("from") ?? undefined;
  const customTo = searchParams.get("to") ?? undefined;
  const fulfillment = searchParams.get("fulfillment");
  const payment = searchParams.get("payment");
  const product = searchParams.get("product");
  const mode = (searchParams.get("mode") as SaleStatusMode | null) ?? "confirmadas";
  const minPrice = searchParams.get("minPrice") ?? undefined;
  const maxPrice = searchParams.get("maxPrice") ?? undefined;
  const active = searchParams.get("active");
  const hasPrice = searchParams.get("hasPrice");
  const itemType = (searchParams.get("itemType") as ItemTypeFilter | null) ?? "principal";

  const isLive = periodPreset === "hoje" && !customFrom && !customTo;

  const advancedCount = [channel, categoryId, payment, fulfillment, minPrice, maxPrice, active, hasPrice, itemType !== "principal" ? "x" : null].filter(
    Boolean
  ).length;

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
      minPrice,
      maxPrice,
      active,
      hasPrice,
      itemType,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandId, storesRaw, channel, categoryId, periodPreset, customFrom, customTo, payment, fulfillment, product, minPrice, maxPrice, active, hasPrice, itemType]
  );

  const [data, setData] = useState<LiveSalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [paused, setPaused] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "polling">("connecting");
  const [detailProduct, setDetailProduct] = useState<ProductSalesSummary | null>(null);
  const [orderGroup, setOrderGroup] = useState<OrderFeedGroup | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  // Realtime só roda quando o período selecionado é "Hoje" (visão ao vivo) —
  // pra período histórico não faz sentido escutar mudança em tempo real nem
  // manter polling em segundo plano. Ver migration 0012_realtime_orders.sql.
  useEffect(() => {
    if (paused || !isLive) return;
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
  }, [paused, isLive, refresh]);

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
  const modeEvents = useMemo(() => {
    const includeAddons = itemType !== "principal";
    const events = filterByStatusMode(data?.currentEvents ?? [], mode, includeAddons);
    if (itemType === "adicional") return events.filter((e) => e.isAddon);
    return events;
  }, [data, mode, itemType]);
  const previousModeEvents = useMemo(() => {
    const includeAddons = itemType !== "principal";
    const events = filterByStatusMode(data?.previousEvents ?? [], mode, includeAddons);
    if (itemType === "adicional") return events.filter((e) => e.isAddon);
    return events;
  }, [data, mode, itemType]);

  const indicators = useMemo(() => buildOverallIndicators(confirmedEvents, cancelledEvents), [confirmedEvents, cancelledEvents]);
  const summaries = useMemo(() => buildProductSalesSummaries(modeEvents), [modeEvents]);
  const previousSummaries = useMemo(() => buildProductSalesSummaries(previousModeEvents), [previousModeEvents]);
  const { growing, declining } = useMemo(() => buildGrowthComparison(summaries, previousSummaries), [summaries, previousSummaries]);

  const selectedSummary = product ? summaries.find((s) => s.productName === product) ?? null : null;
  const totalRevenueForShare = summaries.reduce((sum, s) => sum + s.revenue, 0);
  const pendingNames = new Set(data?.pendingUnificationNames ?? []);

  const byHourSource = product ? modeEvents.filter((e) => e.productName === product) : modeEvents;
  const byHour = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const e of byHourSource) {
      const hour = Number(new Date(e.orderedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).slice(0, 2));
      buckets.set(hour, (buckets.get(hour) ?? 0) + e.quantity);
    }
    return Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, "0")}h`, revenue: buckets.get(hour) ?? 0 }));
  }, [byHourSource]);

  const byStore = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const e of modeEvents) buckets.set(e.storeName, (buckets.get(e.storeName) ?? 0) + e.totalPrice);
    return Array.from(buckets.entries())
      .map(([label, revenue]) => ({ label, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12);
  }, [modeEvents]);

  const byChannel = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const e of modeEvents) buckets.set(e.channel, (buckets.get(e.channel) ?? 0) + e.totalPrice);
    return Array.from(buckets.entries())
      .map(([label, revenue]) => ({ label, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [modeEvents]);

  const orderGroups = useMemo(() => groupEventsByOrder([...modeEvents].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)).slice(0, 60)), [modeEvents]);

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
      {/* Filtros principais: busca, loja, período, status — marca só aparece
       * quando há mais de uma marca no escopo. Todo o resto vive em
       * "Filtros avançados" pra não sobrecarregar a primeira tela. */}
      <div className="flex flex-wrap items-center gap-2">
        <ProductAutocomplete options={data?.productOptions ?? []} onSelect={(name) => commitParams({ product: name })} />
        {brands.length > 1 && <BrandSelect brands={brands} current={brandId} />}
        <MultiSelectFilter
          paramKey="stores"
          options={(data?.storeOptions ?? []).map((s) => ({ value: s.id, label: s.name }))}
          selected={storeIds}
          placeholder="Lojas"
          searchPlaceholder="Buscar loja..."
        />
        <PeriodSelect current={periodPreset} />
        <DateRangePicker from={customFrom} to={customTo} />
        <SingleSelectFilter
          paramKey="mode"
          options={MODE_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
          current={mode === "confirmadas" ? null : mode}
          allLabel="Confirmadas"
          className="w-40"
        />
        <Button variant="outline" size="sm" onClick={() => setAdvancedOpen(true)}>
          <SlidersHorizontal className="size-3.5" />
          Filtros avançados{advancedCount > 0 ? ` · ${advancedCount}` : ""}
        </Button>
        {product && (
          <Badge variant="secondary" className="gap-1">
            Produto: {product}
            <button type="button" onClick={() => commitParams({ product: null })} aria-label="Remover filtro de produto">
              ×
            </button>
          </Badge>
        )}
      </div>

      <Sheet open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <SheetContent side="right" className="sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Filtros avançados</SheetTitle>
            <SheetDescription>Refinamentos adicionais — canal, categoria, pagamento e mais.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <FilterField label="Canal">
              <SingleSelectFilter paramKey="channel" options={CHANNEL_OPTIONS} current={channel} allLabel="Todos os canais" className="w-full" />
            </FilterField>
            <FilterField label="Categoria">
              <SingleSelectFilter
                paramKey="category"
                options={(data?.categoryOptions ?? []).map((c) => ({ value: c.id, label: c.name }))}
                current={categoryId}
                allLabel="Todas as categorias"
                className="w-full"
              />
            </FilterField>
            <FilterField label="Forma de pagamento">
              <SingleSelectFilter
                paramKey="payment"
                options={(data?.currentEvents ?? [])
                  .map((e) => e.paymentMethod)
                  .filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)
                  .map((v) => ({ value: v, label: v }))}
                current={payment}
                allLabel="Todos os pagamentos"
                className="w-full"
              />
            </FilterField>
            <FilterField label="Tipo do pedido">
              <SingleSelectFilter paramKey="fulfillment" options={FULFILLMENT_OPTIONS} current={fulfillment} allLabel="Todos os tipos" className="w-full" />
            </FilterField>
            <FilterField label="Faixa de preço">
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Mín. R$"
                  inputMode="decimal"
                  defaultValue={minPrice ?? ""}
                  onBlur={(e) => commitParams({ minPrice: e.target.value || null })}
                  className="w-24"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  placeholder="Máx. R$"
                  inputMode="decimal"
                  defaultValue={maxPrice ?? ""}
                  onBlur={(e) => commitParams({ maxPrice: e.target.value || null })}
                  className="w-24"
                />
              </div>
            </FilterField>
            <FilterField label="Ativo/inativo no catálogo">
              <SingleSelectFilter paramKey="active" options={ACTIVE_OPTIONS} current={active} allLabel="Ativos e inativos" className="w-full" />
            </FilterField>
            <FilterField label="Com/sem preço cadastrado">
              <SingleSelectFilter paramKey="hasPrice" options={HAS_PRICE_OPTIONS} current={hasPrice} allLabel="Com/sem preço" className="w-full" />
            </FilterField>
            <FilterField label="Produto principal ou adicional">
              <SingleSelectFilter
                paramKey="itemType"
                options={ITEM_TYPE_OPTIONS}
                current={itemType === "principal" ? null : itemType}
                allLabel="Só produto principal"
                className="w-full"
              />
            </FilterField>
            {advancedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() =>
                  commitParams({ channel: null, category: null, payment: null, fulfillment: null, minPrice: null, maxPrice: null, active: null, hasPrice: null, itemType: null })
                }
              >
                Limpar filtros avançados
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {isLive ? (
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
              {indicators.cancelledUnits > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="size-3" /> {indicators.cancelledUnits} cancelado(s)
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Histórico de produtos vendidos</p>
            <p className="text-xs text-muted-foreground">Período selecionado não é &quot;Hoje&quot; — sem atualização ao vivo.</p>
          </div>
          <div className="flex items-center gap-2">
            {indicators.cancelledUnits > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="size-3" /> {indicators.cancelledUnits} cancelado(s)
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} /> Atualizar agora
            </Button>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Unidades vendidas"
              definition="Soma real da quantidade de cada item vendido (não o número de pedidos), no modo e filtros selecionados."
              basis={`Modo: ${MODE_OPTIONS.find((m) => m.value === mode)?.label}`}
              value={String(indicators.unitsSold)}
              icon={<Package className="size-4" />}
              state="neutral"
            />
            <KpiCard
              label="Pedidos"
              definition="Contagem de pedidos DISTINTOS com status concluído no recorte — nunca confundido com unidades vendidas."
              basis="Pedidos distintos, status concluído"
              value={String(indicators.completedOrders)}
              icon={<ShoppingBag className="size-4" />}
              state="neutral"
            />
            <KpiCard
              label="Faturamento"
              definition="Soma do valor dos itens (sem adicionais) nos pedidos confirmados do recorte."
              basis="Itens principais, pedidos concluídos"
              value={formatCurrency(indicators.revenue)}
              icon={<Wallet className="size-4" />}
              state="neutral"
            />
          </div>

          {selectedSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {selectedSummary.productName}
                  {pendingNames.has(selectedSummary.productName) && (
                    <Badge variant="outline" className="text-amber-600">
                      Pendente de unificação
                    </Badge>
                  )}
                </CardTitle>
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
                          O recorte tem mais linhas do que o teto de segurança da consulta — refine os
                          filtros (loja, canal ou período) pra ver o total exato.
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
                pendingNames={pendingNames}
                onViewDetails={(s) => setDetailProduct(s)}
              />
            </CardContent>
          </Card>

          {isLive && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vendas acontecendo agora</CardTitle>
                <CardDescription>{orderGroups.length} pedido(s) mais recente(s) no recorte selecionado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {orderGroups.map((g) => (
                  <div
                    key={g.orderId}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
                  >
                    <span className="whitespace-nowrap text-muted-foreground">
                      {new Date(g.orderedAt).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="font-medium">
                      {g.firstProductName}
                      {g.itemCount > 1 && (
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground underline"
                          onClick={() => setOrderGroup(g)}
                        >
                          + {g.itemCount - 1} {g.itemCount - 1 === 1 ? "item" : "itens"}
                        </button>
                      )}
                    </span>
                    <span className="truncate">{g.storeName}</span>
                    <span className="truncate">{g.channel}</span>
                    <span className="tabular-nums">{formatCurrency(g.totalValue)}</span>
                    <Badge variant="outline" className="ml-auto whitespace-nowrap">
                      {g.status}
                    </Badge>
                    <span className="whitespace-nowrap font-mono text-muted-foreground">#{g.orderId.slice(0, 8)}</span>
                  </div>
                ))}
                {orderGroups.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma venda no recorte selecionado.</p>}
              </CardContent>
            </Card>
          )}

          <CollapsibleSection
            title="Ver evolução"
            description={`Unidades vendidas por hora do dia (fuso America/Sao_Paulo), modo ${MODE_OPTIONS.find((m) => m.value === mode)?.label.toLowerCase()}${product ? ` — ${product}` : ""}.`}
          >
            <SalesBarChart data={byHour} height={200} />
          </CollapsibleSection>

          <CollapsibleSection title="Ver vendas por loja" description="Faturamento por loja no recorte selecionado.">
            <SalesBarChart data={byStore} height={200} />
          </CollapsibleSection>

          <CollapsibleSection title="Ver vendas por canal" description="Faturamento por canal de venda no recorte selecionado.">
            <SalesBarChart data={byChannel} height={200} />
          </CollapsibleSection>

          <CollapsibleSection title="Ver crescimento e queda" description="Comparação de unidades vendidas vs. o período anterior de mesma duração.">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <TrendingUp className="size-4 text-success" /> Produtos em crescimento
                </p>
                <div className="space-y-1.5">
                  {growing.slice(0, 8).map((r) => (
                    <div key={r.productName} className="flex items-center justify-between text-sm">
                      <span className="truncate">{r.productName}</span>
                      <Badge className="bg-success">+{formatPercent(r.growth)}</Badge>
                    </div>
                  ))}
                  {growing.length === 0 && <p className="text-sm text-muted-foreground">Sem dados suficientes pra comparar.</p>}
                </div>
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <TrendingDown className="size-4 text-danger" /> Produtos em queda
                </p>
                <div className="space-y-1.5">
                  {declining.slice(0, 8).map((r) => (
                    <div key={r.productName} className="flex items-center justify-between text-sm">
                      <span className="truncate">{r.productName}</span>
                      <Badge variant="destructive">{formatPercent(r.growth)}</Badge>
                    </div>
                  ))}
                  {declining.length === 0 && <p className="text-sm text-muted-foreground">Sem dados suficientes pra comparar.</p>}
                </div>
              </div>
            </div>
          </CollapsibleSection>
        </>
      )}

      <ProductDetailDrawer
        open={detailProduct !== null}
        onOpenChange={(o) => !o && setDetailProduct(null)}
        summary={detailProduct}
        events={data?.currentEvents ?? []}
        variants={detailProduct ? data?.variantsByProduct[detailProduct.productName] ?? [] : []}
        pending={detailProduct ? pendingNames.has(detailProduct.productName) : false}
        onFilterPage={(name) => {
          commitParams({ product: name });
          setDetailProduct(null);
        }}
      />
      <OrderItemsDrawer open={orderGroup !== null} onOpenChange={(o) => !o && setOrderGroup(null)} group={orderGroup} />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
