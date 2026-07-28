import Link from "next/link";
import { subDays } from "date-fns";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Percent,
  Receipt,
  Repeat,
  ShieldAlert,
  Truck,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isPeriodPreset, previousPeriod, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import { formatDayLabel, formatDateTimeBR } from "@/lib/dates/format";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { MultiSelectFilter } from "@/components/filters/multi-select-filter";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { KpiCard, type KpiState } from "@/components/dashboard/kpi-card";
import { AboutDataDialog, type SyncCoverageRow } from "@/components/dashboard/about-data-dialog";
import { PrivacyProvider, PrivacyToggleButton, Sensitive } from "@/components/dashboard/privacy-context";
import { MainRevenueChart } from "@/components/dashboard/main-revenue-chart";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  averageTicket,
  cancellationRate,
  cancelledOrdersCount,
  completedOrdersCount,
  discountsTotal,
  deliveryFeesTotal,
  grossRevenue,
  growthRate,
  netRevenue,
  newCustomersCount,
  returningCustomersCount,
  totalOrders,
  uniqueCustomers,
  type OrderMetricInput,
} from "@/lib/metrics/orders";
import { buildProductRanking, rankByRevenue, type ProductOrderItemInput } from "@/lib/metrics/products";
import { salesByDay, groupDailyByWeek, groupDailyByMonth } from "@/lib/metrics/sales-timeseries";
import { cancellationsByReason, type CancelledOrderInput } from "@/lib/metrics/cancellations";
import { buildRfmSegmentation, computeCustomerStats, type CustomerOrderInput } from "@/lib/metrics/rfm";
import { buildRecommendations, type Recommendation } from "@/lib/metrics/recommendations";
import {
  buildSyncAlerts,
  type IntegrationHealthInput,
  type RecentSyncJobInput,
  type SyncAlert,
} from "@/lib/metrics/alerts";
import type { Brand, Product, Store } from "@/types/database";

const STALE_THRESHOLD_MINUTES = 60;
const RECENT_JOBS_WINDOW_DAYS = 1;
const MIN_CUSTOMER_SAMPLE = 10;
const HIGH_CANCEL_RATE_THRESHOLD = 0.1;

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/** Estado genérico por variação percentual: acima de 0 é positivo, abaixo é
 * crítico — usado só nos KPIs onde "crescer" é objetivamente bom. */
function growthState(growth: number | null | undefined): KpiState {
  if (growth === null || growth === undefined) return "neutral";
  if (growth > 0.001) return "positive";
  if (growth < -0.001) return "critical";
  return "neutral";
}

interface RecentOrderRow {
  id: string;
  ordered_at: string;
  gross_amount: number;
  status: string;
  customers: { full_name: string | null } | null;
  order_items: { original_name: string; quantity: number; is_addon: boolean }[];
}

interface CancelledOrderRaw {
  id: string;
  store_id: string;
  gross_amount: number;
  ordered_at: string;
  cancellations: { reason: string | null }[] | { reason: string | null } | null;
}

interface OrderWithItems {
  status: string;
  ordered_at: string;
  order_items: { original_name: string; quantity: number; total_price: number; is_addon: boolean }[];
}

export default async function ExecutiveDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawPeriod = typeof params.period === "string" ? params.period : "30d";
  const preset: PeriodPreset = isPeriodPreset(rawPeriod) ? rawPeriod : "30d";
  const selectedBrandId = typeof params.brand === "string" ? params.brand : null;
  const customFrom = typeof params.from === "string" ? params.from : undefined;
  const customTo = typeof params.to === "string" ? params.to : undefined;
  const storesRaw = typeof params.stores === "string" ? params.stores : undefined;
  const selectedStoreIdsParam = storesRaw ? storesRaw.split(",").filter(Boolean) : [];

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

  const { data: stores } = await supabase
    .from("stores")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Store[]>();

  const allStoreIds = (stores ?? []).map((s) => s.id);
  const selectedStoreIds = selectedStoreIdsParam.filter((id) => allStoreIds.includes(id));
  const storeIds = selectedStoreIds.length > 0 ? selectedStoreIds : allStoreIds;
  const storeFallback = storeIds.length ? storeIds : fallback;

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));

  // Cobertura de sincronização — reusada pelo painel "Sobre estes dados", pelo
  // KPI "Dados incompletos" e pelos alertas operacionais abaixo.
  const { data: channelsForCoverage } = await supabase
    .from("sales_channels")
    .select("id, store_id, platform")
    .in("store_id", storeFallback);

  const channelIds = (channelsForCoverage ?? []).map((c) => c.id);

  const { data: integrationsForCoverage } = await supabase
    .from("integrations")
    .select("id, sales_channel_id, last_synced_at, is_active")
    .in("sales_channel_id", channelIds.length ? channelIds : fallback);

  const syncCoverage: SyncCoverageRow[] = (channelsForCoverage ?? []).map((channel) => {
    const integration = (integrationsForCoverage ?? []).find((i) => i.sales_channel_id === channel.id);
    return {
      storeName: storeById.get(channel.store_id)?.name ?? "—",
      platform: channel.platform,
      lastSyncedAt: integration?.last_synced_at ?? null,
      isActive: integration?.is_active ?? false,
    };
  });

  const incompleteCoverageCount = syncCoverage.filter((r) => !r.isActive || r.lastSyncedAt === null).length;

  function labelFor(salesChannelId: string): string {
    const channel = (channelsForCoverage ?? []).find((c) => c.id === salesChannelId);
    const store = channel ? storeById.get(channel.store_id) : undefined;
    const brand = store ? brandById.get(store.brand_id) : undefined;
    return `${brand?.name ?? "—"} — ${store?.name ?? "—"}`;
  }

  const integrationInputs: IntegrationHealthInput[] = (integrationsForCoverage ?? []).map((i) => ({
    integrationId: i.id,
    label: labelFor(i.sales_channel_id),
    lastSyncedAt: i.last_synced_at,
    isActive: i.is_active,
  }));

  const integrationIds = (integrationsForCoverage ?? []).map((i) => i.id);
  const since = subDays(new Date(), RECENT_JOBS_WINDOW_DAYS).toISOString();

  const { data: recentJobsRaw } = await supabase
    .from("sync_jobs")
    .select("integration_id, status, error_summary, records_failed, started_at")
    .in("integration_id", integrationIds.length ? integrationIds : fallback)
    .gte("started_at", since);

  const recentJobInputs: RecentSyncJobInput[] = (recentJobsRaw ?? []).map((j) => ({
    integrationId: j.integration_id,
    status: j.status,
    errorSummary: j.error_summary,
    recordsFailed: j.records_failed,
    startedAt: j.started_at,
  }));

  const syncAlerts: SyncAlert[] = buildSyncAlerts({
    integrations: integrationInputs,
    recentJobs: recentJobInputs,
    now: new Date().toISOString(),
    staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
  });

  const period = customFrom && customTo ? resolveCustomPeriod(customFrom, customTo) : resolvePeriod(preset);
  const previous = previousPeriod(period);

  const { data: currentOrdersRaw } = await supabase
    .from("orders")
    .select("id, store_id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  const { data: previousOrdersRaw } = await supabase
    .from("orders")
    .select("id, store_id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", previous.start.toISOString())
    .lte("ordered_at", previous.end.toISOString());

  type StoreOrderRow = OrderMetricInput & { store_id: string; ordered_at: string };
  const currentOrders = (currentOrdersRaw ?? []) as StoreOrderRow[];
  const previousOrders = (previousOrdersRaw ?? []) as StoreOrderRow[];
  const hasOrders = currentOrders.length > 0 || previousOrders.length > 0;
  const hasPriorPeriodData = previousOrders.length > 0;

  // "Clientes novos"/"Recorrentes" precisam da 1ª compra em TODO o histórico,
  // não só no período — e a mesma base alimenta a segmentação RFM abaixo.
  const { data: allTimeOrders } = await supabase
    .from("orders")
    .select("customer_id, gross_amount, ordered_at")
    .in("store_id", storeFallback)
    .not("customer_id", "is", null);

  const firstOrderDateByCustomer = new Map<string, string>();
  for (const o of allTimeOrders ?? []) {
    const existing = firstOrderDateByCustomer.get(o.customer_id as string);
    if (!existing || o.ordered_at < existing) {
      firstOrderDateByCustomer.set(o.customer_id as string, o.ordered_at);
    }
  }

  const customerOrders: CustomerOrderInput[] = (allTimeOrders ?? []).map((o) => ({
    customer_id: o.customer_id as string,
    gross_amount: o.gross_amount,
    ordered_at: o.ordered_at,
  }));
  const rfmRows = buildRfmSegmentation(computeCustomerStats(customerOrders, new Date().toISOString()));
  const atRiskCustomersCount = rfmRows.filter((r) => r.segment === "Em risco" || r.segment === "Perdidos").length;

  const { data: recentOrdersRaw } = await supabase
    .from("orders")
    .select("id, ordered_at, gross_amount, status, customers(full_name), order_items(original_name, quantity, is_addon)")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString())
    .order("ordered_at", { ascending: false })
    .limit(3);

  const recentOrders = (recentOrdersRaw ?? []) as unknown as RecentOrderRow[];

  const { data: cancelledOrdersRaw } = await supabase
    .from("orders")
    .select("id, store_id, gross_amount, ordered_at, cancellations(reason)")
    .in("store_id", storeFallback)
    .eq("status", "cancelado")
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  const cancelledOrders: CancelledOrderInput[] = ((cancelledOrdersRaw ?? []) as unknown as CancelledOrderRaw[]).map(
    (o) => {
      const cancellation = Array.isArray(o.cancellations) ? o.cancellations[0] : o.cancellations;
      return {
        id: o.id,
        store_id: o.store_id,
        gross_amount: o.gross_amount,
        ordered_at: o.ordered_at,
        reason: cancellation?.reason ?? null,
      };
    }
  );
  const topCancelReason = cancellationsByReason(cancelledOrders)[0] ?? null;

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Product[]>();

  const { data: orderItemsRaw } = await supabase
    .from("orders")
    .select("status, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  function flattenItems(rows: OrderWithItems[]): ProductOrderItemInput[] {
    return rows.flatMap((order) =>
      order.order_items.map((item) => ({
        original_name: item.original_name,
        quantity: item.quantity,
        total_price: item.total_price,
        is_addon: item.is_addon,
        order_status: order.status,
        ordered_at: order.ordered_at,
      }))
    );
  }

  const orderItemsFlat = flattenItems((orderItemsRaw ?? []) as unknown as OrderWithItems[]);
  const rankingRows = buildProductRanking(orderItemsFlat);
  const topProducts = rankByRevenue(rankingRows).slice(0, 3);

  const catalogNames = (products ?? []).map((p) => p.canonical_name);
  const soldNames = new Set(rankingRows.map((r) => r.name));
  const stalledProductsCount = catalogNames.filter((name) => !soldNames.has(name)).length;

  // KPIs principais.
  const gross = grossRevenue(currentOrders);
  const grossPrev = grossRevenue(previousOrders);
  const net = netRevenue(currentOrders);
  const netPrev = netRevenue(previousOrders);
  const completed = completedOrdersCount(currentOrders);
  const completedPrev = completedOrdersCount(previousOrders);
  const ticket = averageTicket(currentOrders);
  const ticketPrev = averageTicket(previousOrders);
  const cancelRate = cancellationRate(currentOrders);
  const uniqueCust = uniqueCustomers(currentOrders);
  const uniqueCustPrev = uniqueCustomers(previousOrders);
  const newCustomers = newCustomersCount(currentOrders, firstOrderDateByCustomer, period.start.toISOString(), period.end.toISOString());
  const newCustomersPrev = newCustomersCount(previousOrders, firstOrderDateByCustomer, previous.start.toISOString(), previous.end.toISOString());
  const returningCustomers = returningCustomersCount(currentOrders, firstOrderDateByCustomer, period.start.toISOString(), period.end.toISOString());
  const returningCustomersPrev = returningCustomersCount(previousOrders, firstOrderDateByCustomer, previous.start.toISOString(), previous.end.toISOString());
  const discounts = discountsTotal(currentOrders);
  const discountsPrev = discountsTotal(previousOrders);
  const deliveryFees = deliveryFeesTotal(currentOrders);
  const deliveryFeesPrev = deliveryFeesTotal(previousOrders);
  const revenueGrowth = hasPriorPeriodData ? growthRate(gross, grossPrev) : null;

  const dailyRows = salesByDay(currentOrders);
  const revenueByDay = dailyRows.map((r) => ({ label: formatDayLabel(r.date), revenue: r.revenue, orders: r.orders }));
  const weeklyRows = groupDailyByWeek(dailyRows).map((r) => ({ label: formatDayLabel(r.date), revenue: r.revenue, orders: r.orders }));
  const monthlyRows = groupDailyByMonth(dailyRows).map((r) => {
    const [year, month] = r.date.split("-");
    return { label: `${MONTH_LABELS_ABBR[Number(month) - 1]}/${year.slice(2)}`, revenue: r.revenue, orders: r.orders };
  });

  // Comparação de lojas (resumo — top 3 por faturamento, ranking completo em /lojas).
  const storeRows = (stores ?? [])
    .map((store) => {
      const cur = currentOrders.filter((o) => o.store_id === store.id);
      const prev = previousOrders.filter((o) => o.store_id === store.id);
      return {
        store,
        brandName: brandById.get(store.brand_id)?.name ?? "—",
        gross: grossRevenue(cur),
        grossPrev: grossRevenue(prev),
        orders: totalOrders(cur),
      };
    })
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 3);

  const revenuePreviousForRecs = hasPriorPeriodData ? grossPrev : null;
  const recommendations: Recommendation[] = buildRecommendations({
    revenueCurrent: gross,
    revenuePrevious: revenuePreviousForRecs,
    cancellationRate: cancelRate,
    cancelledCount: cancelledOrdersCount(currentOrders),
    topCancelReason,
    stalledProductsCount,
    atRiskCustomersCount,
    totalCustomersCount: rfmRows.length,
    minCustomerSample: MIN_CUSTOMER_SAMPLE,
  });

  const opportunityItems = [
    ...syncAlerts.map((a) => ({
      kind: "Operacional" as const,
      severity: a.severity,
      title: a.title,
      description: a.description,
      id: a.id,
      href: "/alertas",
    })),
    ...recommendations.map((r) => ({
      kind: "Negócio" as const,
      severity: r.severity === "alta" ? ("alta" as const) : ("media" as const),
      title: r.title,
      description: r.description,
      id: r.id,
      href: "/recomendacoes",
    })),
  ].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "alta" ? -1 : 1));
  const topOpportunity = opportunityItems[0] ?? null;

  const complementaryAttentionCount =
    (incompleteCoverageCount > 0 ? 1 : 0) + (cancelRate !== null && cancelRate >= HIGH_CANCEL_RATE_THRESHOLD ? 1 : 0);

  return (
    <PrivacyProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard executivo</h1>
            <p className="text-sm text-muted-foreground">
              {hasOrders
                ? "Quanto vendeu, quantos pedidos, ticket médio e a principal oportunidade do período."
                : "Nenhuma informação disponível. Sincronize suas lojas para começar."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BrandSelect brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} current={selectedBrandId} />
            <MultiSelectFilter
              paramKey="stores"
              options={(stores ?? []).map((s) => ({ value: s.id, label: s.name }))}
              selected={selectedStoreIds}
              placeholder="Lojas"
              searchPlaceholder="Buscar loja..."
            />
            <PeriodSelect current={preset} />
            <DateRangePicker from={customFrom} to={customTo} />
            <PrivacyToggleButton />
            <AboutDataDialog coverage={syncCoverage} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Faturamento bruto"
            definition="Soma de gross_amount de todos os pedidos NÃO CANCELADOS do período — inclui pedidos ainda em andamento, não só concluídos."
            basis="Todos os pedidos não cancelados"
            value={formatCurrency(gross)}
            icon={<Wallet className="size-4" />}
            state={growthState(revenueGrowth ?? undefined)}
            growthPercent={revenueGrowth}
            sensitive
          />
          <KpiCard
            label="Pedidos concluídos"
            definition="Contagem de pedidos com status = concluído no período. Não inclui pedidos em andamento, cancelados ou de períodos anteriores."
            basis="Status = concluído"
            value={String(completed)}
            icon={<CheckCircle2 className="size-4" />}
            state={growthState(hasPriorPeriodData ? growthRate(completed, completedPrev) : undefined)}
            growthPercent={hasPriorPeriodData ? growthRate(completed, completedPrev) : null}
          />
          <KpiCard
            label="Ticket médio"
            definition="Faturamento de pedidos CONCLUÍDOS dividido pela quantidade de pedidos concluídos — base diferente do Faturamento bruto (que inclui pedidos em andamento). Ver METRICS_AUDIT.md."
            basis={`Denominador: ${completed} pedido(s) concluído(s)`}
            value={formatCurrency(ticket)}
            icon={<Receipt className="size-4" />}
            state={ticket === null ? "unavailable" : growthState(ticket !== null && ticketPrev !== null ? growthRate(ticket, ticketPrev) : undefined)}
            growthPercent={ticket === null ? undefined : ticketPrev === null ? null : growthRate(ticket, ticketPrev)}
            unavailableReason="Nenhum pedido concluído no período"
            sensitive
          />
          <KpiCard
            label="Clientes únicos"
            definition="Clientes distintos identificados no período — pedidos sem cliente vinculado ficam fora da contagem."
            basis="Pedidos com cliente identificado"
            value={String(uniqueCust)}
            icon={<Users className="size-4" />}
            state={growthState(hasPriorPeriodData ? growthRate(uniqueCust, uniqueCustPrev) : undefined)}
            growthPercent={hasPriorPeriodData ? growthRate(uniqueCust, uniqueCustPrev) : null}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Faturamento e pedidos</CardTitle>
              <CardDescription>Faturamento bruto (barras) e pedidos não cancelados (linha) no escopo selecionado.</CardDescription>
            </CardHeader>
            <CardContent>
              <MainRevenueChart daily={revenueByDay} weekly={weeklyRows} monthly={monthlyRows} revenueGrowth={revenueGrowth} hasPriorPeriodData={hasPriorPeriodData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo</CardTitle>
              <CardDescription>Onde olhar primeiro.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SummaryRow
                label="Loja com maior faturamento"
                value={storeRows[0] ? storeRows[0].store.name : "—"}
                detail={storeRows[0] ? <Sensitive value={formatCurrency(storeRows[0].gross)} /> : undefined}
                href="/lojas"
              />
              <SummaryRow
                label="Produto mais vendido"
                value={topProducts[0] ? topProducts[0].name : "—"}
                detail={topProducts[0] ? `${topProducts[0].quantity} un.` : undefined}
                href="/produtos"
              />
              <SummaryRow
                label="Oportunidade mais importante"
                value={topOpportunity ? topOpportunity.title : "Nenhuma no momento"}
                detail={topOpportunity ? (topOpportunity.severity === "alta" ? "Alta prioridade" : "Média prioridade") : undefined}
                href={topOpportunity?.href ?? "/recomendacoes"}
              />
            </CardContent>
          </Card>
        </div>

        <CollapsibleSection
          title="Indicadores complementares"
          description={
            complementaryAttentionCount > 0
              ? `7 indicadores complementares · ${complementaryAttentionCount} requer${complementaryAttentionCount > 1 ? "em" : ""} atenção`
              : "7 indicadores complementares · tudo em ordem"
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Faturamento líquido"
              definition="Soma de net_amount só quando a plataforma de origem informa esse valor. Mostra 'dado indisponível' quando nenhum pedido do período tem esse valor."
              basis="Pedidos não cancelados com valor líquido informado"
              value={formatCurrency(net)}
              icon={<Banknote className="size-4" />}
              state={net === null ? "unavailable" : growthState(net !== null && netPrev !== null ? growthRate(net, netPrev) : undefined)}
              growthPercent={net === null ? undefined : netPrev === null ? null : growthRate(net, netPrev)}
              unavailableReason="Plataforma/importação não informou valor líquido neste período"
              sensitive
            />
            <KpiCard
              label="Clientes novos"
              definition="Clientes cuja primeira compra em TODO o histórico sincronizado caiu dentro do período — depende do histórico completo já ter sido importado."
              basis="1ª compra dentro do período"
              value={String(newCustomers)}
              icon={<UserPlus className="size-4" />}
              state={growthState(hasPriorPeriodData ? growthRate(newCustomers, newCustomersPrev) : undefined)}
              growthPercent={hasPriorPeriodData ? growthRate(newCustomers, newCustomersPrev) : null}
            />
            <KpiCard
              label="Recorrentes"
              definition="Clientes únicos do período cuja primeira compra (em todo o histórico) foi ANTES do início do período — ou seja, clientes únicos menos clientes novos."
              basis="Clientes únicos − clientes novos"
              value={String(returningCustomers)}
              icon={<Repeat className="size-4" />}
              state={growthState(hasPriorPeriodData ? growthRate(returningCustomers, returningCustomersPrev) : undefined)}
              growthPercent={hasPriorPeriodData ? growthRate(returningCustomers, returningCustomersPrev) : null}
            />
            <KpiCard
              label="Descontos concedidos"
              definition="Soma de discount_amount de todos os pedidos do período (inclui cancelados, se a plataforma já tiver registrado desconto antes do cancelamento)."
              basis="Soma de discount_amount"
              value={formatCurrency(discounts)}
              icon={<Percent className="size-4" />}
              state="neutral"
              growthPercent={hasPriorPeriodData ? growthRate(discounts, discountsPrev) : null}
              sensitive
            />
            <KpiCard
              label="Taxa de entrega"
              definition="Soma de delivery_fee_amount cobrado dos clientes no período. Não é receita da loja — normalmente repassado ao entregador/plataforma."
              basis="Soma de delivery_fee_amount"
              value={formatCurrency(deliveryFees)}
              icon={<Truck className="size-4" />}
              state="neutral"
              growthPercent={hasPriorPeriodData ? growthRate(deliveryFees, deliveryFeesPrev) : null}
              sensitive
            />
            <KpiCard
              label="Cancelamentos"
              definition="Pedidos cancelados dividido pelo total de pedidos do período (todos os status, não só concluídos)."
              basis={`${cancelledOrdersCount(currentOrders)} de ${totalOrders(currentOrders)} pedido(s)`}
              value={formatPercent(cancelRate)}
              icon={<XCircle className="size-4" />}
              state={cancelRate === null ? "unavailable" : cancelRate >= HIGH_CANCEL_RATE_THRESHOLD ? "critical" : cancelRate === 0 ? "positive" : "neutral"}
              unavailableReason="Nenhum pedido no período"
            />
            <KpiCard
              label="Dados incompletos"
              definition="Canais de venda inativos ou que nunca sincronizaram, dentro do escopo selecionado. Enquanto um canal aparecer aqui, as métricas acima podem estar sub-representando esse canal — ver 'Sobre estes dados'."
              basis={`${syncCoverage.length - incompleteCoverageCount} de ${syncCoverage.length} canal(is) com sincronização ativa`}
              value={String(incompleteCoverageCount)}
              icon={<ShieldAlert className="size-4" />}
              state={incompleteCoverageCount > 0 ? "critical" : "positive"}
            />
          </div>
        </CollapsibleSection>

        <div className="grid gap-4 lg:grid-cols-3">
          <CompactListCard
            title="Top 3 lojas"
            href="/lojas"
            rows={storeRows.map((row) => ({
              key: row.store.id,
              primary: row.store.name,
              secondary: row.brandName,
              value: <Sensitive value={formatCurrency(row.gross)} />,
            }))}
            emptyLabel="Nenhuma loja com pedidos no período."
          />

          <CompactListCard
            title="Top 3 produtos"
            href="/produtos"
            rows={topProducts.map((row) => ({
              key: row.name,
              primary: row.name,
              secondary: `${row.quantity} un.`,
              value: <Sensitive value={formatCurrency(row.revenue)} />,
            }))}
            emptyLabel="Nenhuma venda concluída no período."
          />

          <CompactListCard
            title="Últimos 3 pedidos"
            href="/vendas?tab=transacoes"
            rows={recentOrders.map((order) => ({
              key: order.id,
              primary: order.customers?.full_name ?? "Não identificado",
              secondary: formatDateTimeBR(order.ordered_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
              value: <Sensitive value={formatCurrency(order.gross_amount)} />,
            }))}
            emptyLabel="Nenhum pedido no período selecionado."
          />
        </div>
      </div>
    </PrivacyProvider>
  );
}

const MONTH_LABELS_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function SummaryRow({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  href: string;
}) {
  return (
    <div className="space-y-0.5 border-b pb-3 last:border-0 last:pb-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
      <div className="flex items-center justify-between gap-2">
        {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        <Link href={href} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Ver análise <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function CompactListCard({
  title,
  href,
  rows,
  emptyLabel,
}: {
  title: string;
  href: string;
  rows: { key: string; primary: string; secondary: string; value: React.ReactNode }[];
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Ver análise completa <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{row.primary}</p>
              <p className="truncate text-xs text-muted-foreground">{row.secondary}</p>
            </div>
            <span className="whitespace-nowrap tabular-nums">{row.value}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
      </CardContent>
    </Card>
  );
}
