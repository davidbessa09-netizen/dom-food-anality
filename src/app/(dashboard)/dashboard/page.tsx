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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isPeriodPreset, previousPeriod, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { KpiCard, type KpiState } from "@/components/dashboard/kpi-card";
import { AboutDataDialog, type SyncCoverageRow } from "@/components/dashboard/about-data-dialog";
import { RevenueOrdersChart } from "@/components/charts/revenue-orders-chart";
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
import { salesByDay } from "@/lib/metrics/sales-timeseries";
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

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
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

  const storeIds = (stores ?? []).map((s) => s.id);
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
  const lastSyncedAt = syncCoverage
    .map((r) => r.lastSyncedAt)
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1);

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
    .limit(8);

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

  const { data: previousOrderItemsRaw } = await supabase
    .from("orders")
    .select("status, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
    .in("store_id", storeFallback)
    .gte("ordered_at", previous.start.toISOString())
    .lte("ordered_at", previous.end.toISOString());

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
  const previousOrderItemsFlat = flattenItems((previousOrderItemsRaw ?? []) as unknown as OrderWithItems[]);

  const rankingRows = buildProductRanking(orderItemsFlat);
  const topProducts = rankByRevenue(rankingRows).slice(0, 5);

  const catalogNames = (products ?? []).map((p) => p.canonical_name);
  const soldNames = new Set(rankingRows.map((r) => r.name));
  const stalledProductsCount = catalogNames.filter((name) => !soldNames.has(name)).length;

  const previousRankingRows = buildProductRanking(previousOrderItemsFlat);
  const currentRevenueByName = new Map(rankingRows.map((r) => [r.name, r.revenue]));
  const decliningProducts = previousRankingRows
    .map((prev) => {
      const currentRevenue = currentRevenueByName.get(prev.name) ?? 0;
      return { name: prev.name, currentRevenue, previousRevenue: prev.revenue, growth: growthRate(currentRevenue, prev.revenue) };
    })
    .filter((p) => p.growth !== null && p.growth < 0)
    .sort((a, b) => (a.growth ?? 0) - (b.growth ?? 0))
    .slice(0, 5);

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

  const revenueByDay = salesByDay(currentOrders).map((r) => ({
    label: new Date(`${r.date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    revenue: r.revenue,
    orders: r.orders,
  }));
  const revenueTrend = revenueByDay.map((r) => r.revenue);

  // Comparação de lojas (resumo — top 5 por faturamento, ranking completo em /lojas).
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
    .slice(0, 5);

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
    ...syncAlerts.map((a) => ({ kind: "Operacional" as const, severity: a.severity, title: a.title, description: a.description, id: a.id })),
    ...recommendations.map((r) => ({ kind: "Negócio" as const, severity: r.severity === "alta" ? "alta" as const : "media" as const, title: r.title, description: r.description, id: r.id })),
  ]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "alta" ? -1 : 1))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard executivo</h1>
          <p className="text-sm text-muted-foreground">
            {hasOrders
              ? "Visão orientada a decisão — faturamento, pedidos, clientes e oportunidades do período selecionado."
              : "Sem pedidos no período — importe pedidos em Importações ou rode o seed de demonstração."}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Atualizado {timeAgo(lastSyncedAt ?? null)} · {(brands ?? []).length} marca(s), {(stores ?? []).length} loja(s) no
            escopo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} current={selectedBrandId} />
          <PeriodSelect current={preset} />
          <DateRangePicker from={customFrom} to={customTo} />
          <AboutDataDialog coverage={syncCoverage} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Faturamento bruto"
          definition="Soma de gross_amount de todos os pedidos NÃO CANCELADOS do período — inclui pedidos ainda em andamento, não só concluídos."
          basis="Todos os pedidos não cancelados"
          value={formatCurrency(gross)}
          icon={<Wallet className="size-4" />}
          state={growthState(hasPriorPeriodData ? growthRate(gross, grossPrev) : undefined)}
          growthPercent={hasPriorPeriodData ? growthRate(gross, grossPrev) : null}
          trend={revenueTrend}
        />
        <KpiCard
          label="Faturamento líquido"
          definition="Soma de net_amount só quando a plataforma de origem informa esse valor. Mostra 'dado indisponível' quando nenhum pedido do período tem esse valor."
          basis="Pedidos não cancelados com valor líquido informado"
          value={formatCurrency(net)}
          icon={<Banknote className="size-4" />}
          state={net === null ? "unavailable" : growthState(net !== null && netPrev !== null ? growthRate(net, netPrev) : undefined)}
          growthPercent={net === null ? undefined : netPrev === null ? null : growthRate(net, netPrev)}
          unavailableReason="Plataforma/importação não informou valor líquido neste período"
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
        />
        <KpiCard
          label="Taxa de cancelamento"
          definition="Pedidos cancelados dividido pelo total de pedidos do período (todos os status, não só concluídos)."
          basis={`${cancelledOrdersCount(currentOrders)} de ${totalOrders(currentOrders)} pedido(s)`}
          value={formatPercent(cancelRate)}
          icon={<XCircle className="size-4" />}
          state={cancelRate === null ? "unavailable" : cancelRate >= 0.1 ? "critical" : cancelRate === 0 ? "positive" : "neutral"}
          unavailableReason="Nenhum pedido no período"
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
        />
        <KpiCard
          label="Taxa de entrega"
          definition="Soma de delivery_fee_amount cobrado dos clientes no período. Não é receita da loja — normalmente repassado ao entregador/plataforma."
          basis="Soma de delivery_fee_amount"
          value={formatCurrency(deliveryFees)}
          icon={<Truck className="size-4" />}
          state="neutral"
          growthPercent={hasPriorPeriodData ? growthRate(deliveryFees, deliveryFeesPrev) : null}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturamento e pedidos no tempo</CardTitle>
          <CardDescription>
            Faturamento bruto (barras, eixo esquerdo) e contagem de pedidos não cancelados (linha, eixo direito) por dia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {revenueByDay.length > 0 ? (
            <RevenueOrdersChart data={revenueByDay} />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido no período selecionado.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Comparação de lojas</CardTitle>
                <CardDescription>Top 5 por faturamento no período.</CardDescription>
              </div>
              <Link href="/lojas" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Ver tudo <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Crescimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storeRows.map((row) => {
                  const growth = hasPriorPeriodData ? growthRate(row.gross, row.grossPrev) : null;
                  return (
                    <TableRow key={row.store.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium">{row.store.name}</span>
                        <span className="text-muted-foreground"> · {row.brandName}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(row.gross)}</TableCell>
                      <TableCell className="text-right">
                        {growth === null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Badge variant={growth >= 0 ? "default" : "destructive"} className={growth >= 0 ? "bg-success" : undefined}>
                            {growth >= 0 ? "+" : ""}
                            {(growth * 100).toFixed(1)}%
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {storeRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      Nenhuma loja com pedidos no período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Oportunidades e alertas</CardTitle>
                <CardDescription>Operacionais (sincronização) e de negócio, mais urgentes primeiro.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {opportunityItems.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="rounded-md border p-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant={item.severity === "alta" ? "destructive" : "outline"}>
                    {item.severity === "alta" ? "Alta prioridade" : "Média prioridade"}
                  </Badge>
                  <Badge variant="secondary">{item.kind}</Badge>
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            ))}
            {opportunityItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma oportunidade ou alerta no momento — sincronizações em dia e indicadores dentro do esperado.
              </p>
            )}
            <div className="flex gap-3 pt-1 text-xs">
              <Link href="/alertas" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Ver todos os alertas <ArrowRight className="size-3.5" />
              </Link>
              <Link href="/recomendacoes" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                Ver todas as recomendações <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Top produtos</CardTitle>
                <CardDescription>Top 5 por faturamento, pedidos concluídos no período.</CardDescription>
              </div>
              <Link href="/produtos" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Ver tudo <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="max-w-[220px] truncate">{row.name}</TableCell>
                    <TableCell className="text-right">{row.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                  </TableRow>
                ))}
                {topProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      Nenhuma venda concluída no período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produtos em queda</CardTitle>
            <CardDescription>Venderam no período anterior e caíram no período atual (mesma duração).</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Antes</TableHead>
                  <TableHead className="text-right">Agora</TableHead>
                  <TableHead className="text-right">Variação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decliningProducts.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="max-w-[160px] truncate">{row.name}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(row.previousRevenue)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(row.currentRevenue)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="destructive">{((row.growth ?? 0) * 100).toFixed(0)}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {decliningProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      {hasPriorPeriodData
                        ? "Nenhum produto com queda de faturamento vs. o período anterior."
                        : "Sem período anterior pra comparar."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Pedidos recentes</CardTitle>
              <CardDescription>{recentOrders.length} pedido(s) mais recentes no período. Telefone e nome completo ficam na listagem completa.</CardDescription>
            </div>
            <Link href="/produtos" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Ver todos os pedidos <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Produto(s)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(order.ordered_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{order.customers?.full_name ?? "Não identificado"}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">
                    {order.order_items.length > 0
                      ? order.order_items
                          .filter((i) => !i.is_addon)
                          .map((i) => `${i.quantity}x ${i.original_name}`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{order.status.replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(order.gross_amount)}</TableCell>
                </TableRow>
              ))}
              {recentOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Nenhum pedido no período selecionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
