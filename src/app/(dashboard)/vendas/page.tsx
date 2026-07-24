import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { SalesBarChart } from "@/components/charts/sales-bar-chart";
import { isPeriodPreset, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import {
  salesByDay,
  salesByHour,
  salesByWeekday,
  WEEKDAY_LABELS,
  type SalesOrderInput,
} from "@/lib/metrics/sales-timeseries";
import type { Brand, Store } from "@/types/database";

export default async function SalesPage({
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

  const { data: ordersRaw } = await supabase
    .from("orders")
    .select("gross_amount, status, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  const orders: SalesOrderInput[] = (ordersRaw ?? []) as SalesOrderInput[];

  const byDay = salesByDay(orders).map((r) => ({
    label: new Date(`${r.date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    revenue: r.revenue,
  }));

  const byHour = salesByHour(orders).map((r) => ({
    label: `${String(r.hour).padStart(2, "0")}h`,
    revenue: r.revenue,
  }));

  const byWeekday = salesByWeekday(orders).map((r) => ({
    label: WEEKDAY_LABELS[r.weekday],
    revenue: r.revenue,
  }));

  const hasData = orders.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendas</h1>
          <p className="text-sm text-muted-foreground">
            Faturamento por dia, hora e dia da semana (fuso America/Sao_Paulo).
            Exclui pedidos cancelados.
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
          <CardTitle className="text-base">Vendas por dia</CardTitle>
          <CardDescription>Faturamento bruto diário no período selecionado.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <SalesBarChart data={byDay} />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum pedido no período selecionado.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas por hora do dia</CardTitle>
            <CardDescription>Identifica horários de pico.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <SalesBarChart data={byHour} height={220} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas por dia da semana</CardTitle>
            <CardDescription>Soma de todo o período por dia da semana.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <SalesBarChart data={byWeekday} height={220} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
