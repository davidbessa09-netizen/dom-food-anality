import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { GlobalFilterBar } from "@/components/filters/global-filter-bar";
import { parseFilters } from "@/lib/filters/parse";
import { previousPeriod } from "@/lib/dates/period";
import {
  averageTicket,
  cancellationRate,
  completedOrdersCount,
  grossRevenue,
  growthRate,
  netRevenue,
  repurchaseRate as calculateRepurchaseRate,
  totalOrders,
  uniqueCustomers,
  type OrderMetricInput,
} from "@/lib/metrics/orders";
import { classifyStoreDataStatus, isEligibleForRanking, type StoreChannelHealth } from "@/lib/metrics/store-comparison";
import { StoreRankingBars, type RankingBarRow } from "@/components/lojas/store-ranking-bars";
import { BestPerformerCard } from "@/components/lojas/best-performer-card";
import { StoreCompareSelect } from "@/components/lojas/store-compare-select";
import { StoreDirectCompare } from "@/components/lojas/store-direct-compare";
import { StoreComparisonTable, type StoreComparisonRow } from "@/components/lojas/store-comparison-table";
import { NormalizeToggle } from "@/components/lojas/normalize-toggle";
import { AlertTriangle, Receipt, Repeat, TrendingUp, XCircle } from "lucide-react";
import type { Brand, Store } from "@/types/database";

const PLATFORM_LABEL: Record<string, string> = {
  anota_ai: "Anota AI",
  ifood: "iFood",
  csv_import: "Importação CSV",
  event_tracking: "Rastreamento próprio",
};

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export default async function StoresComparisonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const { period, periodPreset: preset, customFrom, customTo } = filters;
  const selectedBrandId = filters.brandId;
  const previous = previousPeriod(period);
  const normalizeRequested = typeof params.normalize === "string";
  const compareStoresRaw = typeof params.compareStores === "string" ? params.compareStores : "";
  const compareStoreIds = compareStoresRaw ? compareStoresRaw.split(",").filter(Boolean) : [];

  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .returns<Brand[]>();

  const allBrandIds = (brands ?? []).map((b) => b.id);
  const brandIds = selectedBrandId && allBrandIds.includes(selectedBrandId) ? [selectedBrandId] : allBrandIds;

  const { data: storesRaw } = await supabase
    .from("stores")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Store[]>();

  const allCities = [...new Set((storesRaw ?? []).map((s) => s.city).filter((c): c is string => !!c))].sort();
  const stores = (storesRaw ?? []).filter((s) => filters.cityIds.length === 0 || (s.city && filters.cityIds.includes(s.city)));

  const storeIds = stores.map((s) => s.id);
  const storeFallback = storeIds.length ? storeIds : fallback;

  const { data: channels } = await supabase
    .from("sales_channels")
    .select("id, store_id, platform, is_active")
    .in("store_id", storeFallback);

  const channelIds = (channels ?? []).map((c) => c.id);

  const { data: integrations } = await supabase
    .from("integrations")
    .select("sales_channel_id, last_synced_at, is_active")
    .in("sales_channel_id", channelIds.length ? channelIds : fallback);

  let currentOrdersQuery = supabase
    .from("orders")
    .select("id, store_id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());
  if (filters.channel) currentOrdersQuery = currentOrdersQuery.eq("source_platform", filters.channel);
  const { data: currentOrdersRaw } = await currentOrdersQuery;

  let previousOrdersQuery = supabase
    .from("orders")
    .select("id, store_id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", previous.start.toISOString())
    .lte("ordered_at", previous.end.toISOString());
  if (filters.channel) previousOrdersQuery = previousOrdersQuery.eq("source_platform", filters.channel);
  const { data: previousOrdersRaw } = await previousOrdersQuery;

  // Recorrência usa a 1ª compra em todo o histórico visível, mesma base do
  // dashboard (ver METRICS_AUDIT.md) — não é recalculada por loja isolada,
  // pra não contar como "novo" um cliente que só migrou de loja.
  const { data: allTimeOrders } = await supabase
    .from("orders")
    .select("customer_id, ordered_at")
    .in("store_id", storeFallback)
    .not("customer_id", "is", null);

  const firstOrderDateByCustomer = new Map<string, string>();
  for (const o of allTimeOrders ?? []) {
    const existing = firstOrderDateByCustomer.get(o.customer_id as string);
    if (!existing || o.ordered_at < existing) {
      firstOrderDateByCustomer.set(o.customer_id as string, o.ordered_at);
    }
  }

  type StoreOrderRow = OrderMetricInput & { store_id: string };
  const currentOrders = (currentOrdersRaw ?? []) as StoreOrderRow[];
  const previousOrders = (previousOrdersRaw ?? []) as StoreOrderRow[];
  const hasPriorPeriodData = previousOrders.length > 0;

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));

  const rows: StoreComparisonRow[] = stores.map((store) => {
    const storeChannels = (channels ?? []).filter((c) => c.store_id === store.id);
    const channelHealth: StoreChannelHealth[] = storeChannels.map((ch) => {
      const integration = (integrations ?? []).find((i) => i.sales_channel_id === ch.id);
      return { isActive: ch.is_active && (integration?.is_active ?? false), lastSyncedAt: integration?.last_synced_at ?? null };
    });
    const lastSyncedAt = channelHealth
      .map((c) => c.lastSyncedAt)
      .filter((v): v is string => v !== null)
      .sort()
      .at(-1) ?? null;

    const cur = currentOrders.filter((o) => o.store_id === store.id);
    const prev = previousOrders.filter((o) => o.store_id === store.id);

    const dataStatus = classifyStoreDataStatus({
      storeIsActive: store.is_active,
      channels: channelHealth,
      ordersInPeriodCount: cur.length,
    });

    const gross = grossRevenue(cur);
    const grossPrev = grossRevenue(prev);

    return {
      id: store.id,
      name: store.name,
      brandName: brandById.get(store.brand_id)?.name ?? "—",
      city: store.city,
      channels: storeChannels.map((c) => PLATFORM_LABEL[c.platform] ?? c.platform),
      dataStatus,
      lastSyncedAt,
      gross,
      grossGrowth: hasPriorPeriodData ? growthRate(gross, grossPrev) : null,
      net: netRevenue(cur),
      orders: totalOrders(cur),
      completed: completedOrdersCount(cur),
      ticket: averageTicket(cur),
      cancelRate: cancellationRate(cur),
      uniqueCustomers: uniqueCustomers(cur),
      repurchaseRate: calculateRepurchaseRate(cur, firstOrderDateByCustomer, period.start.toISOString(), period.end.toISOString()),
    };
  });

  const eligibleRows = rows.filter((r) => isEligibleForRanking(r.dataStatus));

  const bestRevenue = eligibleRows.length ? [...eligibleRows].sort((a, b) => b.gross - a.gross)[0] : null;
  const bestGrowth = eligibleRows.filter((r) => r.grossGrowth !== null).sort((a, b) => (b.grossGrowth ?? 0) - (a.grossGrowth ?? 0))[0] ?? null;
  const bestTicket = eligibleRows.filter((r) => r.ticket !== null).sort((a, b) => (b.ticket ?? 0) - (a.ticket ?? 0))[0] ?? null;
  const worstCancellation = eligibleRows.filter((r) => r.cancelRate !== null).sort((a, b) => (b.cancelRate ?? 0) - (a.cancelRate ?? 0))[0] ?? null;
  const bestRepurchase = eligibleRows.filter((r) => r.repurchaseRate !== null).sort((a, b) => (b.repurchaseRate ?? 0) - (a.repurchaseRate ?? 0))[0] ?? null;

  const rankingRows: RankingBarRow[] = [...rows]
    .sort((a, b) => b.gross - a.gross)
    .map((r) => ({ id: r.id, name: r.name, brandName: r.brandName, value: r.gross, dataStatus: r.dataStatus }));

  const validCompareIds = compareStoreIds.filter((id) => rows.some((r) => r.id === id));
  const compareRows = rows.filter((r) => validCompareIds.includes(r.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparação de lojas</h1>
          <p className="text-sm text-muted-foreground">
            Faturamento, pedidos, ticket médio e recorrência lado a lado, com indicador de
            confiabilidade dos dados por loja — lojas sem sincronização confiável nunca
            competem pelo &quot;melhor&quot;.
          </p>
        </div>
      </div>

      <GlobalFilterBar
        fields={["brand", "city", "channel", "period"]}
        brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))}
        cities={allCities.map((c) => ({ id: c, name: c }))}
        currentBrandId={selectedBrandId}
        currentCityIds={filters.cityIds}
        currentChannel={filters.channel}
        currentPeriodPreset={preset}
        currentFrom={customFrom}
        currentTo={customTo}
      />

      <div className="flex flex-wrap items-center gap-3">
        <StoreCompareSelect options={rows.map((r) => ({ value: r.id, label: `${r.name} · ${r.brandName}` }))} selected={validCompareIds} />
        <NormalizeToggle checked={normalizeRequested} />
      </div>

      {normalizeRequested && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Normalização por dia aberto indisponível</AlertTitle>
          <AlertDescription>
            O sistema ainda não tem um calendário operacional (dias e horários de funcionamento)
            por loja. Sem esse dado, normalizar faturamento por &quot;dia aberto&quot; exigiria estimar
            quantos dias cada loja esteve aberta a partir dos próprios pedidos — o que inflaria
            lojas com mais histórico sincronizado. Os números abaixo continuam absolutos até que
            esse calendário seja cadastrado.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <BestPerformerCard
          label="Melhor faturamento"
          icon={<TrendingUp className="size-4" />}
          storeName={bestRevenue?.name}
          brandName={bestRevenue?.brandName}
          value={bestRevenue ? formatCurrency(bestRevenue.gross) : undefined}
          emptyReason="Nenhuma loja com dado confiável no período."
        />
        <BestPerformerCard
          label="Maior crescimento"
          icon={<TrendingUp className="size-4" />}
          storeName={bestGrowth?.name}
          brandName={bestGrowth?.brandName}
          value={bestGrowth ? `+${((bestGrowth.grossGrowth ?? 0) * 100).toFixed(1)}%` : undefined}
          emptyReason={hasPriorPeriodData ? "Nenhuma loja com crescimento calculável." : "Sem período anterior pra comparar."}
        />
        <BestPerformerCard
          label="Melhor ticket médio"
          icon={<Receipt className="size-4" />}
          storeName={bestTicket?.name}
          brandName={bestTicket?.brandName}
          value={bestTicket ? formatCurrency(bestTicket.ticket) : undefined}
          emptyReason="Nenhuma loja com pedido concluído no período."
        />
        <BestPerformerCard
          label="Maior cancelamento"
          icon={<XCircle className="size-4" />}
          storeName={worstCancellation?.name}
          brandName={worstCancellation?.brandName}
          value={worstCancellation ? formatPercent(worstCancellation.cancelRate) : undefined}
          emptyReason="Nenhuma loja com pedido no período."
        />
        <BestPerformerCard
          label="Melhor recorrência"
          icon={<Repeat className="size-4" />}
          storeName={bestRepurchase?.name}
          brandName={bestRepurchase?.brandName}
          value={bestRepurchase ? formatPercent(bestRepurchase.repurchaseRate) : undefined}
          emptyReason="Nenhuma loja com cliente identificado no período."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking por faturamento</CardTitle>
          <CardDescription>{rows.length} loja(s) no escopo selecionado.</CardDescription>
        </CardHeader>
        <CardContent>
          <StoreRankingBars rows={rankingRows} />
        </CardContent>
      </Card>

      {compareRows.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparação direta</CardTitle>
            <CardDescription>{compareRows.length} loja(s) selecionada(s) — variação vs. a média do próprio grupo.</CardDescription>
          </CardHeader>
          <CardContent>
            <StoreDirectCompare rows={compareRows} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tabela comparativa</CardTitle>
          <CardDescription>
            Colunas ordenáveis (clique no cabeçalho), busca, paginação, densidade e exportação em
            CSV. &quot;Confiabilidade&quot; indica se o número da loja é dado real ou se a integração está
            incompleta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoreComparisonTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
