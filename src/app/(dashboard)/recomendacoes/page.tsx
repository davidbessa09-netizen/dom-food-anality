import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { isPeriodPreset, previousPeriod, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import { buildProductRanking, findProductsWithoutSales, type ProductOrderItemInput } from "@/lib/metrics/products";
import { cancellationsByReason, type CancelledOrderInput } from "@/lib/metrics/cancellations";
import { buildRfmSegmentation, computeCustomerStats, type CustomerOrderInput } from "@/lib/metrics/rfm";
import { buildRecommendations, type Recommendation, type RecommendationSeverity } from "@/lib/metrics/recommendations";
import type { Brand, Product, Store } from "@/types/database";

const MIN_CUSTOMER_SAMPLE = 10;

const SEVERITY_LABEL: Record<RecommendationSeverity, string> = {
  alta: "Alta prioridade",
  media: "Média prioridade",
  baixa: "Baixa prioridade",
};

const SEVERITY_VARIANT: Record<RecommendationSeverity, "default" | "secondary" | "destructive" | "outline"> = {
  alta: "destructive",
  media: "default",
  baixa: "outline",
};

export default async function RecommendationsPage({
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
  const priorPeriod = previousPeriod(period);

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

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Product[]>();

  // Faturamento do período atual e do período anterior (mesma duração), pra
  // comparar tendência — nunca cancelados.
  const { data: currentOrdersRaw } = await supabase
    .from("orders")
    .select("gross_amount, status")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  const { data: previousOrdersRaw } = await supabase
    .from("orders")
    .select("gross_amount, status")
    .in("store_id", storeFallback)
    .gte("ordered_at", priorPeriod.start.toISOString())
    .lte("ordered_at", priorPeriod.end.toISOString());

  const revenueCurrent = (currentOrdersRaw ?? [])
    .filter((o) => o.status !== "cancelado")
    .reduce((sum, o) => sum + o.gross_amount, 0);
  const hasPriorData = (previousOrdersRaw ?? []).length > 0;
  const revenuePrevious = hasPriorData
    ? (previousOrdersRaw ?? []).filter((o) => o.status !== "cancelado").reduce((sum, o) => sum + o.gross_amount, 0)
    : null;

  // Cancelamentos do período atual.
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

  const totalOrdersCount = (currentOrdersRaw ?? []).length;
  const cancellationRate = totalOrdersCount > 0 ? cancelledOrders.length / totalOrdersCount : null;
  const topCancelReason = cancellationsByReason(cancelledOrders)[0] ?? null;

  // Produtos parados: itens do catálogo sem venda no período.
  const { data: ordersWithItems } = await supabase
    .from("orders")
    .select("status, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  interface OrderWithItems {
    status: string;
    ordered_at: string;
    order_items: { original_name: string; quantity: number; total_price: number; is_addon: boolean }[];
  }

  const orderItemsFlat: ProductOrderItemInput[] = ((ordersWithItems ?? []) as unknown as OrderWithItems[]).flatMap(
    (order) =>
      order.order_items.map((item) => ({
        original_name: item.original_name,
        quantity: item.quantity,
        total_price: item.total_price,
        is_addon: item.is_addon,
        order_status: order.status,
        ordered_at: order.ordered_at,
      }))
  );

  const rankingRows = buildProductRanking(orderItemsFlat);
  const catalogNames = (products ?? []).map((p) => p.canonical_name);
  const stalledProductsCount = findProductsWithoutSales(catalogNames, rankingRows).length;

  // RFM usa todo o histórico, não o período selecionado (ver /clientes).
  const { data: customerOrdersRaw } = await supabase
    .from("orders")
    .select("customer_id, gross_amount, ordered_at")
    .in("store_id", storeFallback)
    .not("customer_id", "is", null);

  const customerOrders: CustomerOrderInput[] = (customerOrdersRaw ?? []).map((o) => ({
    customer_id: o.customer_id as string,
    gross_amount: o.gross_amount,
    ordered_at: o.ordered_at,
  }));

  const now = new Date().toISOString();
  const rfmRows = buildRfmSegmentation(computeCustomerStats(customerOrders, now));
  const atRiskCustomersCount = rfmRows.filter((r) => r.segment === "Em risco" || r.segment === "Perdidos").length;

  const recommendations: Recommendation[] = buildRecommendations({
    revenueCurrent,
    revenuePrevious,
    cancellationRate,
    cancelledCount: cancelledOrders.length,
    topCancelReason,
    stalledProductsCount,
    atRiskCustomersCount,
    totalCustomersCount: rfmRows.length,
    minCustomerSample: MIN_CUSTOMER_SAMPLE,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recomendações</h1>
          <p className="text-sm text-muted-foreground">
            Geradas por regras simples sobre as métricas já calculadas nas outras
            telas — cada recomendação cita o número real que a disparou. Nenhuma
            recomendação aparece quando falta dado suficiente pra calculá-la.
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
          <CardTitle className="text-base">Recomendações do período</CardTitle>
          <CardDescription>{recommendations.length} recomendação(ões) ativa(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recommendations.map((rec) => (
            <div key={rec.id} className="rounded-md border p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[rec.severity]}>{SEVERITY_LABEL[rec.severity]}</Badge>
                <span className="font-medium">{rec.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{rec.description}</p>
            </div>
          ))}
          {recommendations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma recomendação no momento — os indicadores monitorados estão
              dentro do esperado (ou não há dado suficiente pra avaliar algum
              deles, o que também não gera alerta falso).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
