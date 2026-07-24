import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { isPeriodPreset, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import { APP_TIMEZONE } from "@/lib/dates/period";
import {
  cancellationsByHour,
  cancellationsByReason,
  cancellationsByStore,
  totalLostAmount,
  type CancelledOrderInput,
} from "@/lib/metrics/cancellations";
import type { Brand, Store } from "@/types/database";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function hourInSaoPaulo(isoDate: string): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: APP_TIMEZONE }).format(
      new Date(isoDate)
    )
  );
}

export default async function CancellationsPage({
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

  const { data: allOrdersRaw } = await supabase
    .from("orders")
    .select("id, store_id, status, ordered_at")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  const { data: cancelledOrdersRaw } = await supabase
    .from("orders")
    .select("id, store_id, gross_amount, ordered_at, cancellations(reason)")
    .in("store_id", storeFallback)
    .eq("status", "cancelado")
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  interface CancelledOrderRaw {
    id: string;
    store_id: string;
    gross_amount: number;
    ordered_at: string;
    cancellations: { reason: string | null }[] | { reason: string | null } | null;
  }

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

  const totalOrdersCount = (allOrdersRaw ?? []).length;
  const cancellationRate = totalOrdersCount > 0 ? cancelledOrders.length / totalOrdersCount : null;
  const lostAmount = totalLostAmount(cancelledOrders);
  const byStore = cancellationsByStore(cancelledOrders);
  const byReason = cancellationsByReason(cancelledOrders);
  const byHour = cancellationsByHour(cancelledOrders.map((o) => ({ hour: hourInSaoPaulo(o.ordered_at) }))).slice(0, 8);

  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cancelamentos</h1>
          <p className="text-sm text-muted-foreground">
            Quando o motivo não vem da plataforma de origem, mostramos
            explicitamente &quot;Motivo não informado&quot; — nunca inferimos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} current={selectedBrandId} />
          <PeriodSelect current={preset} />
          <DateRangePicker from={customFrom} to={customTo} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pedidos cancelados</CardDescription>
            <CardTitle className="text-3xl">{cancelledOrders.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Taxa de cancelamento</CardDescription>
            <CardTitle className="text-3xl">
              {cancellationRate === null ? "—" : `${(cancellationRate * 100).toFixed(1)}%`}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {cancelledOrders.length} de {totalOrdersCount} pedido(s) no período
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor perdido</CardDescription>
            <CardTitle className="text-3xl">{formatCurrency(lostAmount)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Valor de venda, sem descontar custo de insumo
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por loja</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead className="text-right">Cancelados</TableHead>
                  <TableHead className="text-right">Valor perdido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byStore.map((row) => (
                  <TableRow key={row.storeId}>
                    <TableCell>{storeById.get(row.storeId)?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.lostAmount)}</TableCell>
                  </TableRow>
                ))}
                {byStore.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      Nenhum cancelamento no período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por motivo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {byReason.map((row) => (
              <Badge key={row.reason} variant={row.reason === "Motivo não informado" ? "outline" : "secondary"}>
                {row.reason}: {row.count}
              </Badge>
            ))}
            {byReason.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horários com mais cancelamentos</CardTitle>
          <CardDescription>Horário local (America/Sao_Paulo).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {byHour.map((row) => (
            <Badge key={row.hour} variant="outline">
              {String(row.hour).padStart(2, "0")}h: {row.count}
            </Badge>
          ))}
          {byHour.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
