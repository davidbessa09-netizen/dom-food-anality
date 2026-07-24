import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { isPeriodPreset, previousPeriod, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import {
  averageTicket,
  cancellationRate,
  completedOrdersCount,
  grossRevenue,
  growthRate,
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

function GrowthCell({ current, previous }: { current: number; previous: number }) {
  const growth = growthRate(current, previous);
  if (growth === null) return <span className="text-xs text-muted-foreground">—</span>;
  const positive = growth >= 0;
  return (
    <Badge variant={positive ? "default" : "destructive"} className={positive ? "bg-emerald-600" : undefined}>
      {positive ? "+" : ""}
      {(growth * 100).toFixed(1)}%
    </Badge>
  );
}

export default async function StoresComparisonPage({
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
  const period = customFrom && customTo ? resolveCustomPeriod(customFrom, customTo) : resolvePeriod(preset);
  const previous = previousPeriod(period);

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

  type StoreOrderRow = OrderMetricInput & { store_id: string };
  const currentOrders = (currentOrdersRaw ?? []) as StoreOrderRow[];
  const previousOrders = (previousOrdersRaw ?? []) as StoreOrderRow[];

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));

  const rows = (stores ?? [])
    .map((store) => {
      const cur = currentOrders.filter((o) => o.store_id === store.id);
      const prev = previousOrders.filter((o) => o.store_id === store.id);
      return {
        store,
        brandName: brandById.get(store.brand_id)?.name ?? "—",
        gross: grossRevenue(cur),
        grossPrev: grossRevenue(prev),
        orders: totalOrders(cur),
        completed: completedOrdersCount(cur),
        ticket: averageTicket(cur),
        ticketPrev: averageTicket(prev),
        cancelRate: cancellationRate(cur),
        customers: uniqueCustomers(cur),
      };
    })
    .sort((a, b) => b.gross - a.gross);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comparação de lojas</h1>
          <p className="text-sm text-muted-foreground">
            Faturamento, pedidos e ticket médio lado a lado, com crescimento vs. período
            anterior de mesma duração.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} current={selectedBrandId} />
          <PeriodSelect current={preset} />
          <DateRangePicker from={customFrom} to={customTo} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking por faturamento</CardTitle>
          <CardDescription>{rows.length} loja(s) no escopo selecionado.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Crescimento</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Concluídos</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead className="text-right">Crescimento</TableHead>
                <TableHead className="text-right">Cancelamento</TableHead>
                <TableHead className="text-right">Clientes únicos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ store, brandName, gross, grossPrev, orders, completed, ticket, ticketPrev, cancelRate, customers }) => (
                <TableRow key={store.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {store.name}
                    {store.city ? <span className="text-muted-foreground"> · {store.city}</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{brandName}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatCurrency(gross)}</TableCell>
                  <TableCell className="text-right">
                    <GrowthCell current={gross} previous={grossPrev} />
                  </TableCell>
                  <TableCell className="text-right">{orders}</TableCell>
                  <TableCell className="text-right">{completed}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatCurrency(ticket)}</TableCell>
                  <TableCell className="text-right">
                    {ticket !== null && ticketPrev !== null ? (
                      <GrowthCell current={ticket} previous={ticketPrev} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{formatPercent(cancelRate)}</TableCell>
                  <TableCell className="text-right">{customers}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                    Nenhuma loja no escopo selecionado.
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
