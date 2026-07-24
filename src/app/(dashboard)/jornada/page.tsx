import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { isPeriodPreset, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import {
  buildStatusDistribution,
  ORDER_STATUS_LABELS,
  UNTRACKED_JOURNEY_STAGES,
  type OrderStatus,
} from "@/lib/metrics/funnel";
import type { Brand, Store } from "@/types/database";

export default async function JourneyPage({
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
    .select("status")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  const statuses = (ordersRaw ?? []).map((o) => o.status as OrderStatus);
  const distribution = buildStatusDistribution(statuses);
  const total = statuses.length;

  // Verifica se há eventos de rastreamento próprio (SDK) — se existir volume,
  // no futuro isso habilitaria o funil completo em vez do parcial.
  const { count: menuEventsCount } = await supabase
    .from("menu_events")
    .select("id", { count: "exact", head: true })
    .in("store_id", storeFallback);

  const hasEventTracking = (menuEventsCount ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jornada do cliente</h1>
          <p className="text-sm text-muted-foreground">
            Baseado no status atual dos pedidos — não há eventos de navegação do
            cardápio disponíveis (Anota AI/CSV só fornecem dados de pedido).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} current={selectedBrandId} />
          <PeriodSelect current={preset} />
          <DateRangePicker from={customFrom} to={customTo} />
        </div>
      </div>

      {!hasEventTracking && (
        <Card className="border-amber-400">
          <CardContent className="pt-6 text-sm text-amber-700">
            ⚠️ <strong>Funil parcial.</strong> As etapas abaixo (visualização de
            cardápio, adição ao carrinho, checkout) não têm rastreamento
            disponível nesta integração — não são inventadas nem estimadas,
            simplesmente não aparecem. Só mostramos o que é observável a partir
            do status real do pedido.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição de status dos pedidos</CardTitle>
          <CardDescription>
            {total} pedido(s) no período. Isto é uma fotografia do status
            atual, não uma taxa de avanço entre etapas — não guardamos
            histórico de transição de status por pedido nesta fase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {distribution.map((row) => {
            const pct = total > 0 ? (row.count / total) * 100 : 0;
            return (
              <div key={row.status}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className={row.status === "cancelado" ? "text-destructive" : ""}>
                    {ORDER_STATUS_LABELS[row.status]}
                  </span>
                  <span className="text-muted-foreground">
                    {row.count} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className={`h-2 rounded-full ${row.status === "cancelado" ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {total === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum pedido no período selecionado.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Etapas sem rastreamento disponível</CardTitle>
          <CardDescription>
            Exigiriam um SDK de rastreamento de eventos instalado no cardápio
            próprio (ver INTEGRATIONS.md e METRICS.md) — não se aplica a
            cardápios hospedados inteiramente pela Anota AI/iFood.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {UNTRACKED_JOURNEY_STAGES.map((stage) => (
            <Badge key={stage} variant="outline">
              {stage}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
