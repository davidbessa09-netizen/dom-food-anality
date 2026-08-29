import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { GlobalFilterBar } from "@/components/filters/global-filter-bar";
import { parseFilters } from "@/lib/filters/parse";
import { previousPeriod } from "@/lib/dates/period";
import { formatDayLabel } from "@/lib/dates/format";
import { PageTabs } from "@/components/vendas/page-tabs";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RevenueOrdersChart } from "@/components/charts/revenue-orders-chart";
import { SalesBarChart } from "@/components/charts/sales-bar-chart";
import { ShareBars } from "@/components/vendas/share-bars";
import { TransactionsExtraFilters } from "@/components/vendas/transactions-extra-filters";
import { TransactionsTable, type TransactionRow } from "@/components/vendas/transactions-table";
import { ExportTransactionsButton } from "@/components/vendas/export-transactions-button";
import {
  averageTicket,
  discountsTotal,
  deliveryFeesTotal,
  grossRevenue,
  growthRate,
  totalOrders,
  type OrderMetricInput,
} from "@/lib/metrics/orders";
import { salesByDay, salesByHour, salesByWeekday, WEEKDAY_LABELS } from "@/lib/metrics/sales-timeseries";
import { revenueByChannel, revenueByPaymentMethod } from "@/lib/metrics/sales-breakdown";
import { formatPaymentMethod } from "@/lib/format/payment-method";
import { CHANNEL_OPTIONS, FULFILLMENT_OPTIONS, ORDER_STATUS_OPTIONS } from "@/lib/filters/types";
import { Percent, Receipt, ShoppingCart, Truck, Wallet } from "lucide-react";
import type { Brand, Store } from "@/types/database";

const TRANSACTIONS_PAGE_SIZE = 25;
const FILTER_OPTIONS_SAMPLE = 2000;

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function growthState(growth: number | null): "positive" | "neutral" | "critical" {
  if (growth === null) return "neutral";
  if (growth > 0.001) return "positive";
  if (growth < -0.001) return "critical";
  return "neutral";
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const { period, periodPreset: preset, customFrom, customTo } = filters;
  const selectedBrandId = filters.brandId;
  const previous = previousPeriod(period);

  const user = await getCurrentUser();
  const supabase = await createClient();

  // Visualizador de vendas (RH): acesso total às duas abas de Vendas
  // (Análise + Transações) — bloqueado de todo o resto do sistema pelo
  // middleware/RLS, mas dentro desta página enxerga tudo.
  const tab = typeof params.tab === "string" && params.tab === "transacoes" ? "transacoes" : "analise";

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
  const selectedStoreIds = filters.storeIds.filter((id) => allStoreIds.includes(id));
  const scopedStoreIds = selectedStoreIds.length > 0 ? selectedStoreIds : allStoreIds;
  const storeFallback = scopedStoreIds.length ? scopedStoreIds : fallback;
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));

  function buildHref(nextTab: string) {
    const usp = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))
    );
    usp.set("tab", nextTab);
    return `?${usp.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>
          <p className="text-sm text-muted-foreground">
            Análise agregada do período e exploração completa de transações — a listagem
            detalhada de pedidos vive aqui, não no dashboard.
          </p>
        </div>
        <PageTabs
          tabs={[
            { value: "analise", label: "Análise" },
            { value: "transacoes", label: "Transações" },
          ]}
          current={tab}
          buildHref={buildHref}
        />
      </div>

      <GlobalFilterBar
        fields={tab === "analise" ? ["brand", "stores", "channel", "period"] : ["brand", "stores", "channel", "status", "fulfillment", "period"]}
        brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))}
        stores={(stores ?? []).map((s) => ({ id: s.id, name: s.name }))}
        currentBrandId={selectedBrandId}
        currentStoreIds={selectedStoreIds}
        currentChannel={filters.channel}
        currentPeriodPreset={preset}
        currentFrom={customFrom}
        currentTo={customTo}
        currentStatus={filters.status}
        currentFulfillment={filters.fulfillment}
      />

      {tab === "analise" ? (
        <AnalysisTab
          storeFallback={storeFallback}
          channel={filters.channel}
          periodStart={period.start.toISOString()}
          periodEnd={period.end.toISOString()}
          previousStart={previous.start.toISOString()}
          previousEnd={previous.end.toISOString()}
          supabase={supabase}
        />
      ) : (
        <TransactionsTab
          storeFallback={storeFallback}
          storeById={storeById}
          orgIds={orgIds}
          filters={filters}
          params={params}
          periodStart={period.start.toISOString()}
          periodEnd={period.end.toISOString()}
          supabase={supabase}
        />
      )}
    </div>
  );
}

async function AnalysisTab({
  storeFallback,
  channel,
  periodStart,
  periodEnd,
  previousStart,
  previousEnd,
  supabase,
}: {
  storeFallback: string[];
  channel: string | null;
  periodStart: string;
  periodEnd: string;
  previousStart: string;
  previousEnd: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  let currentQuery = supabase
    .from("orders")
    .select("id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id, source_platform, payment_method, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", periodStart)
    .lte("ordered_at", periodEnd);
  if (channel) currentQuery = currentQuery.eq("source_platform", channel);
  const { data: currentOrdersRaw } = await currentQuery;

  let previousQuery = supabase
    .from("orders")
    .select("id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", previousStart)
    .lte("ordered_at", previousEnd);
  if (channel) previousQuery = previousQuery.eq("source_platform", channel);
  const { data: previousOrdersRaw } = await previousQuery;

  const currentOrders = (currentOrdersRaw ?? []) as (OrderMetricInput & {
    ordered_at: string;
    source_platform: string;
    payment_method: string | null;
  })[];
  const previousOrders = (previousOrdersRaw ?? []) as OrderMetricInput[];
  const hasPriorPeriodData = previousOrders.length > 0;
  const hasData = currentOrders.length > 0;

  const gross = grossRevenue(currentOrders);
  const grossPrev = grossRevenue(previousOrders);
  const orders = totalOrders(currentOrders);
  const ordersPrev = totalOrders(previousOrders);
  const ticket = averageTicket(currentOrders);
  const ticketPrev = averageTicket(previousOrders);
  const discounts = discountsTotal(currentOrders);
  const discountsPrev = discountsTotal(previousOrders);
  const deliveryFees = deliveryFeesTotal(currentOrders);
  const deliveryFeesPrev = deliveryFeesTotal(previousOrders);

  const byDay = salesByDay(currentOrders).map((r) => ({
    label: formatDayLabel(r.date),
    revenue: r.revenue,
    orders: r.orders,
  }));

  const byHour = salesByHour(currentOrders);
  const hoursWithOrders = byHour.filter((h) => h.orders > 0);
  const peakHour = hoursWithOrders.length ? [...hoursWithOrders].sort((a, b) => b.revenue - a.revenue)[0] : null;
  const weakestHour = hoursWithOrders.length ? [...hoursWithOrders].sort((a, b) => a.revenue - b.revenue)[0] : null;
  const byHourChart = byHour.map((r) => ({ label: `${String(r.hour).padStart(2, "0")}h`, revenue: r.revenue, orders: r.orders }));

  const byWeekday = salesByWeekday(currentOrders).map((r) => ({
    label: WEEKDAY_LABELS[r.weekday],
    revenue: r.revenue,
    orders: r.orders,
  }));

  const channelRows = revenueByChannel(currentOrders).map((r) => ({
    key: r.channel,
    label: CHANNEL_OPTIONS.find((o) => o.value === r.channel)?.label ?? r.channel,
    revenue: r.revenue,
    share: r.share,
  }));
  const paymentRows = revenueByPaymentMethod(currentOrders)
    .slice(0, 8)
    .map((r) => ({
      key: r.paymentMethod ?? "__none__",
      label: formatPaymentMethod(r.paymentMethod),
      revenue: r.revenue,
      share: r.share,
    }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Faturamento bruto"
          definition="Soma de gross_amount de todos os pedidos não cancelados no período."
          basis="Todos os pedidos não cancelados"
          value={formatCurrency(gross)}
          icon={<Wallet className="size-4" />}
          state={growthState(hasPriorPeriodData ? growthRate(gross, grossPrev) : null)}
          growthPercent={hasPriorPeriodData ? growthRate(gross, grossPrev) : null}
        />
        <KpiCard
          label="Pedidos"
          definition="Contagem de todos os pedidos do período, incluindo cancelados."
          basis="Todos os status"
          value={String(orders)}
          icon={<ShoppingCart className="size-4" />}
          state={growthState(hasPriorPeriodData ? growthRate(orders, ordersPrev) : null)}
          growthPercent={hasPriorPeriodData ? growthRate(orders, ordersPrev) : null}
        />
        <KpiCard
          label="Ticket médio"
          definition="Faturamento de pedidos concluídos dividido pela quantidade de pedidos concluídos."
          basis="Só pedidos concluídos"
          value={formatCurrency(ticket)}
          icon={<Receipt className="size-4" />}
          state={ticket === null ? "unavailable" : growthState(ticket !== null && ticketPrev !== null ? growthRate(ticket, ticketPrev) : null)}
          growthPercent={ticket === null ? undefined : ticketPrev === null ? null : growthRate(ticket, ticketPrev)}
          unavailableReason="Nenhum pedido concluído no período"
        />
        <KpiCard
          label="Descontos"
          definition="Soma de discount_amount de todos os pedidos do período."
          basis="Soma de discount_amount"
          value={formatCurrency(discounts)}
          icon={<Percent className="size-4" />}
          state="neutral"
          growthPercent={hasPriorPeriodData ? growthRate(discounts, discountsPrev) : null}
        />
        <KpiCard
          label="Taxa de entrega"
          definition="Soma de delivery_fee_amount cobrado no período."
          basis="Soma de delivery_fee_amount"
          value={formatCurrency(deliveryFees)}
          icon={<Truck className="size-4" />}
          state="neutral"
          growthPercent={hasPriorPeriodData ? growthRate(deliveryFees, deliveryFeesPrev) : null}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturamento e pedidos por dia</CardTitle>
          <CardDescription>Comparação com o período anterior de mesma duração nos KPIs acima.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? <RevenueOrdersChart data={byDay} /> : <p className="text-sm text-muted-foreground">Nenhum pedido no período.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas por hora do dia</CardTitle>
            <CardDescription>
              {peakHour ? `Pico: ${String(peakHour.hour).padStart(2, "0")}h (${formatCurrency(peakHour.revenue)}).` : "Sem dado suficiente."}{" "}
              {weakestHour ? `Mais fraco com pedidos: ${String(weakestHour.hour).padStart(2, "0")}h.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasData ? <SalesBarChart data={byHourChart} height={220} /> : <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas por dia da semana</CardTitle>
            <CardDescription>Domingo a sábado, soma de todo o período.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasData ? <SalesBarChart data={byWeekday} height={220} /> : <p className="text-sm text-muted-foreground">Sem dados.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Participação por canal</CardTitle>
          </CardHeader>
          <CardContent>
            <ShareBars rows={channelRows} emptyLabel="Nenhum pedido no período." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Participação por forma de pagamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ShareBars rows={paymentRows} emptyLabel="Nenhum pedido no período." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function TransactionsTab({
  storeFallback,
  storeById,
  orgIds,
  filters,
  params,
  periodStart,
  periodEnd,
  supabase,
}: {
  storeFallback: string[];
  storeById: Map<string, Store>;
  orgIds: string[];
  filters: ReturnType<typeof parseFilters>;
  params: Record<string, string | string[] | undefined>;
  periodStart: string;
  periodEnd: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const currentPage = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);
  const payment = typeof params.payment === "string" ? params.payment : null;
  const neighborhood = typeof params.neighborhood === "string" ? params.neighborhood : null;
  const minValue = typeof params.minValue === "string" ? params.minValue : undefined;
  const maxValue = typeof params.maxValue === "string" ? params.maxValue : undefined;
  const search = typeof params.q === "string" ? params.q : undefined;
  const orderNumberSearch = typeof params.orderNumber === "string" ? params.orderNumber.trim() : undefined;

  // Amostra pra popular as opções de bairro/pagamento do filtro (não é a
  // fonte da tabela em si) e a busca por cliente (resolve os ids que
  // batem no nome primeiro, em vez de filtrar via join aninhado — o
  // PostgREST só filtra recurso embutido com `!inner`, o que excluiria
  // pedidos sem cliente vinculado) são independentes uma da outra —
  // rodam em paralelo em vez de sequencial pra não somar a latência das
  // duas no tempo de carregamento da página.
  const [{ data: sampleRows }, matchedCustomers] = await Promise.all([
    supabase
      .from("orders")
      .select("payment_method, neighborhood_raw")
      .in("store_id", storeFallback)
      .gte("ordered_at", periodStart)
      .lte("ordered_at", periodEnd)
      .order("ordered_at", { ascending: false })
      .limit(FILTER_OPTIONS_SAMPLE),
    search
      ? supabase
          .from("customers")
          .select("id")
          .in("organization_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"])
          .ilike("full_name", `%${search}%`)
      : Promise.resolve({ data: null }),
  ]);

  const paymentOptions = [...new Set((sampleRows ?? []).map((r) => r.payment_method).filter((v): v is string => !!v))]
    .map((v) => ({ value: v, label: formatPaymentMethod(v) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const neighborhoodOptions = [...new Set((sampleRows ?? []).map((r) => r.neighborhood_raw).filter((v): v is string => !!v))]
    .sort()
    .map((v) => ({ value: v, label: v }));

  const searchCustomerIds: string[] | null = search ? (matchedCustomers.data ?? []).map((c) => c.id) : null;

  // count "planned" (estimativa via plano de execução) em vez de "exact" —
  // com a tabela orders já em milhares de linhas, contar exatamente TODAS
  // as linhas que batem com o filtro (não só a página atual) a cada
  // carregamento da tela ficava perceptivelmente lento e só piora
  // conforme mais pedidos entram. A estimativa é suficiente pra paginação
  // (não precisa ser um número exato pro usuário).
  let query = supabase
    .from("orders")
    .select(
      "id, store_id, ordered_at, status, fulfillment_type, source_platform, payment_method, neighborhood_raw, gross_amount, discount_amount, delivery_fee_amount, net_amount, raw_payload, customers(full_name, phone_masked), order_items(original_name, quantity, is_addon, total_price)",
      { count: "planned" }
    )
    .in("store_id", storeFallback)
    .gte("ordered_at", periodStart)
    .lte("ordered_at", periodEnd)
    .order("ordered_at", { ascending: false });

  if (filters.channel) query = query.eq("source_platform", filters.channel);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.fulfillment) query = query.eq("fulfillment_type", filters.fulfillment);
  if (payment) query = query.eq("payment_method", payment);
  if (neighborhood) query = query.eq("neighborhood_raw", neighborhood);
  if (minValue) query = query.gte("gross_amount", Number(minValue));
  if (maxValue) query = query.lte("gross_amount", Number(maxValue));
  if (searchCustomerIds !== null) query = query.in("customer_id", searchCustomerIds.length ? searchCustomerIds : ["00000000-0000-0000-0000-000000000000"]);
  // Nº do pedido: `source_external_id` é o próprio nº de pedido pra
  // origens como Bar Fácil (codVenda) e CSV, mas pra Anota AI é o _id
  // interno do Mongo (não o número que aparece no painel) — o número
  // real da Anota AI só existe dentro de raw_payload.shortReference
  // (ver [[extractOrderNumber]]). O OR cobre os dois casos numa busca só.
  if (orderNumberSearch) {
    query = query.or(`source_external_id.eq.${orderNumberSearch},raw_payload->>shortReference.eq.${orderNumberSearch}`);
  }

  const from = (currentPage - 1) * TRANSACTIONS_PAGE_SIZE;
  const { data: ordersRaw, count } = await query.range(from, from + TRANSACTIONS_PAGE_SIZE - 1);

  interface OrderRaw {
    id: string;
    store_id: string;
    ordered_at: string;
    status: string;
    fulfillment_type: string;
    source_platform: string;
    payment_method: string | null;
    neighborhood_raw: string | null;
    gross_amount: number;
    discount_amount: number;
    delivery_fee_amount: number;
    net_amount: number | null;
    raw_payload: Record<string, unknown> | null;
    customers: { full_name: string | null; phone_masked: string | null } | { full_name: string | null; phone_masked: string | null }[] | null;
    order_items: { original_name: string; quantity: number; is_addon: boolean; total_price: number }[];
  }

  /** Terminal/caixa que registrou a venda — hoje só o Bar Fácil informa
   * isso (`codTerminal`/`codVendaTerminal` no payload bruto salvo em
   * raw_payload). Outras origens não têm esse dado, então fica ausente. */
  function extractTerminal(sourcePlatform: string, rawPayload: Record<string, unknown> | null): string | null {
    if (sourcePlatform !== "bar_facil" || !rawPayload) return null;
    const terminal = rawPayload.codTerminal ?? rawPayload.codVendaTerminal;
    return terminal !== undefined && terminal !== null ? String(terminal) : null;
  }

  /** Número do pedido gerado pela Anota AI (`raw_payload.shortReference`) —
   * único por pedido (confirmado ao vivo), diferente de `raw_payload.check`
   * (contador interno que se repete até entre pedidos de entrega, sem
   * relação com o pedido) e de `raw_payload.customer.name` (nome de quem
   * operou o caixa/comanda, também se repete entre pedidos diferentes).
   * Mostrado sempre, em toda linha — não só quando falta cliente
   * identificado (pedidos de balcão/comanda não têm telefone, então
   * upsertCustomer nunca cria um registro só com nome). Outras origens
   * (Bar Fácil, CSV) não têm esse campo, então fica ausente. */
  function extractOrderNumber(sourcePlatform: string, rawPayload: Record<string, unknown> | null): string | null {
    if (sourcePlatform !== "anota_ai") return null;
    const shortReference = rawPayload?.shortReference;
    return shortReference !== undefined && shortReference !== null ? String(shortReference) : null;
  }

  /** Nome bruto do pedido na Anota AI (`raw_payload.customer.name`) — usado
   * só como INFORMAÇÃO, nunca como identidade de cliente (por isso não
   * cria/vincula um registro em `customers`, ver upsertCustomer). Em
   * pedidos de balcão/comanda (sem telefone) costuma ser o nome de quem
   * atendeu ou um código de mesa/comanda ("C22"); em delivery, o nome do
   * cliente mesmo, só que sem histórico entre pedidos (não é dedupável). */
  function extractRawCustomerName(sourcePlatform: string, rawPayload: Record<string, unknown> | null): string | null {
    if (sourcePlatform !== "anota_ai") return null;
    const customer = rawPayload?.customer as { name?: unknown } | undefined;
    const name = customer?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }

  const rows: TransactionRow[] = ((ordersRaw ?? []) as unknown as OrderRaw[]).map((o) => {
    const customer = Array.isArray(o.customers) ? o.customers[0] : o.customers;
    const store = storeById.get(o.store_id);
    return {
      id: o.id,
      orderedAt: o.ordered_at,
      storeName: store?.name ?? "—",
      channelLabel: CHANNEL_OPTIONS.find((c) => c.value === o.source_platform)?.label ?? o.source_platform,
      statusLabel: ORDER_STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status,
      fulfillmentLabel: FULFILLMENT_OPTIONS.find((f) => f.value === o.fulfillment_type)?.label ?? o.fulfillment_type,
      paymentLabel: formatPaymentMethod(o.payment_method),
      neighborhood: o.neighborhood_raw,
      terminal: extractTerminal(o.source_platform, o.raw_payload),
      orderNumber: extractOrderNumber(o.source_platform, o.raw_payload),
      customerName: customer?.full_name ?? extractRawCustomerName(o.source_platform, o.raw_payload),
      customerPhone: customer?.phone_masked ?? null,
      grossAmount: o.gross_amount,
      discountAmount: o.discount_amount,
      deliveryFeeAmount: o.delivery_fee_amount,
      netAmount: o.net_amount,
      items: o.order_items.map((i) => ({ name: i.original_name, quantity: i.quantity, isAddon: i.is_addon, totalPrice: i.total_price })),
    };
  });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TRANSACTIONS_PAGE_SIZE));

  function pageHref(page: number) {
    const usp = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))
    );
    usp.set("page", String(page));
    return `?${usp.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TransactionsExtraFilters
          paymentOptions={paymentOptions}
          neighborhoodOptions={neighborhoodOptions}
          currentPayment={payment}
          currentNeighborhood={neighborhood}
          currentMin={minValue}
          currentMax={maxValue}
          currentSearch={search}
          currentOrderNumber={orderNumberSearch}
        />
        <ExportTransactionsButton
          params={{
            storeIds: storeFallback,
            periodStart,
            periodEnd,
            channel: filters.channel,
            status: filters.status,
            fulfillment: filters.fulfillment,
            payment,
            neighborhood,
            minValue,
            maxValue,
            search,
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transações</CardTitle>
          <CardDescription>
            {total} pedido(s) no escopo e filtros selecionados — {TRANSACTIONS_PAGE_SIZE} por página.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionsTable rows={rows} />
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Página {currentPage} de {totalPages}
              </span>
              <div className="flex gap-2">
                {currentPage <= 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    Anterior
                  </Button>
                ) : (
                  <Button render={<a href={pageHref(currentPage - 1)} />} nativeButton={false} variant="outline" size="sm">
                    Anterior
                  </Button>
                )}
                {currentPage >= totalPages ? (
                  <Button variant="outline" size="sm" disabled>
                    Próxima
                  </Button>
                ) : (
                  <Button render={<a href={pageHref(currentPage + 1)} />} nativeButton={false} variant="outline" size="sm">
                    Próxima
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
