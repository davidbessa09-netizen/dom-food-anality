import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isPeriodPreset, previousPeriod, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  totalOrders,
  uniqueCustomers,
  type OrderMetricInput,
} from "@/lib/metrics/orders";
import type { Brand, Store } from "@/types/database";

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function GrowthBadge({ current, previous }: { current: number; previous: number }) {
  const growth = growthRate(current, previous);
  if (growth === null) return null;
  const positive = growth >= 0;
  return (
    <Badge variant={positive ? "default" : "destructive"} className={positive ? "bg-emerald-600" : undefined}>
      {positive ? "+" : ""}
      {(growth * 100).toFixed(1)}% vs. período anterior
    </Badge>
  );
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
  const brandIds =
    selectedBrandId && allBrandIds.includes(selectedBrandId) ? [selectedBrandId] : allBrandIds;

  const { data: stores } = await supabase
    .from("stores")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Store[]>();

  const storeIds = (stores ?? []).map((s) => s.id);
  const storeFallback = storeIds.length ? storeIds : fallback;

  const period = customFrom && customTo ? resolveCustomPeriod(customFrom, customTo) : resolvePeriod(preset);
  const previous = previousPeriod(period);

  const { data: currentOrdersRaw } = await supabase
    .from("orders")
    .select("id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  const { data: previousOrdersRaw } = await supabase
    .from("orders")
    .select("id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", previous.start.toISOString())
    .lte("ordered_at", previous.end.toISOString());

  // Necessário para "clientes novos": data da 1ª compra em TODO o histórico, não só no período.
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

  const { data: detailedOrdersRaw } = await supabase
    .from("orders")
    .select(
      "id, ordered_at, gross_amount, payment_method, status, customers(full_name, phone_masked), order_items(original_name, quantity, is_addon)"
    )
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString())
    .order("ordered_at", { ascending: false })
    .limit(100);

  interface DetailedOrderRow {
    id: string;
    ordered_at: string;
    gross_amount: number;
    payment_method: string | null;
    status: string;
    customers: { full_name: string | null; phone_masked: string | null } | null;
    order_items: { original_name: string; quantity: number; is_addon: boolean }[];
  }

  const detailedOrders = (detailedOrdersRaw ?? []) as unknown as DetailedOrderRow[];

  const currentOrders = (currentOrdersRaw ?? []) as OrderMetricInput[];
  const previousOrders = (previousOrdersRaw ?? []) as OrderMetricInput[];

  const hasOrders = currentOrders.length > 0 || previousOrders.length > 0;

  const gross = grossRevenue(currentOrders);
  const grossPrev = grossRevenue(previousOrders);
  const net = netRevenue(currentOrders);
  const ticket = averageTicket(currentOrders);
  const ticketPrev = averageTicket(previousOrders);
  const newCustomers = newCustomersCount(
    currentOrders,
    firstOrderDateByCustomer,
    period.start.toISOString(),
    period.end.toISOString()
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard executivo</h1>
          <p className="text-sm text-muted-foreground">
            {hasOrders
              ? "Métricas calculadas a partir de pedidos reais/importados no período selecionado."
              : "Sem pedidos no período — importe pedidos em Importações ou rode o seed de demonstração."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} current={selectedBrandId} />
          <PeriodSelect current={preset} />
          <DateRangePicker from={customFrom} to={customTo} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faturamento bruto</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(gross)}</CardTitle>
          </CardHeader>
          <CardContent>
            <GrowthBadge current={gross} previous={grossPrev} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faturamento líquido</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(net)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {net === null ? "Dado indisponível — plataforma/importação não informou valor líquido" : "Calculado"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ticket médio</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(ticket)}</CardTitle>
          </CardHeader>
          <CardContent>
            {ticket !== null && ticketPrev !== null && <GrowthBadge current={ticket} previous={ticketPrev} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Taxa de cancelamento</CardDescription>
            <CardTitle className="text-3xl">{formatPercent(cancellationRate(currentOrders))}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {cancelledOrdersCount(currentOrders)} de {totalOrders(currentOrders)} pedido(s)
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de pedidos</CardDescription>
            <CardTitle className="text-2xl">{totalOrders(currentOrders)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pedidos concluídos</CardDescription>
            <CardTitle className="text-2xl">{completedOrdersCount(currentOrders)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clientes únicos</CardDescription>
            <CardTitle className="text-2xl">{uniqueCustomers(currentOrders)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clientes novos</CardDescription>
            <CardTitle className="text-2xl">{newCustomers}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Descontos concedidos</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(discountsTotal(currentOrders))}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Taxas de entrega</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(deliveryFeesTotal(currentOrders))}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos do período</CardTitle>
          <CardDescription>
            Até 100 pedidos mais recentes. Telefone sempre mascarado (LGPD) — ver
            SECURITY.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Produto(s)</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailedOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(order.ordered_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {order.customers?.full_name ?? "Não identificado"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {order.customers?.phone_masked ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs">
                    {order.order_items.length > 0
                      ? order.order_items
                          .filter((i) => !i.is_addon)
                          .map((i) => `${i.quantity}x ${i.original_name}`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{order.payment_method ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(order.gross_amount)}</TableCell>
                </TableRow>
              ))}
              {detailedOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Nenhum pedido no período selecionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marcas e lojas</CardTitle>
          <CardDescription>Escopo visível para o seu usuário (aplicado via RLS).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(brands ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma marca visível ainda. Rode o seed de demonstração
              (<code>supabase/seed/demo-data.sql</code>) ou cadastre marcas reais em
              Configurações.
            </p>
          )}
          {(brands ?? [])
            .filter((b) => brandIds.includes(b.id))
            .map((brand) => (
            <div key={brand.id}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: brand.color_hex ?? "#999" }}
                />
                <span className="font-medium">{brand.name}</span>
              </div>
              <div className="flex flex-wrap gap-2 pl-4">
                {(stores ?? [])
                  .filter((s) => s.brand_id === brand.id)
                  .map((store) => (
                    <Badge key={store.id} variant={store.is_active ? "default" : "outline"}>
                      {store.name}
                      {store.city ? ` · ${store.city}` : ""}
                    </Badge>
                  ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
