import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { isPeriodPreset, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import { buildProductPairs, type ComboOrderItemInput } from "@/lib/metrics/combos";
import type { Brand, Store } from "@/types/database";

export default async function CombosPage({
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

  const { data: ordersInPeriod } = await supabase
    .from("orders")
    .select("id, status, order_items(original_name, is_addon)")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  interface OrderWithItems {
    id: string;
    status: string;
    order_items: { original_name: string; is_addon: boolean }[];
  }

  const comboItems: ComboOrderItemInput[] = ((ordersInPeriod ?? []) as unknown as OrderWithItems[]).flatMap((order) =>
    order.order_items.map((item) => ({
      order_id: order.id,
      original_name: item.original_name,
      is_addon: item.is_addon,
      order_status: order.status,
    }))
  );

  const pairs = buildProductPairs(comboItems).slice(0, 30);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Combos e associações</h1>
          <p className="text-sm text-muted-foreground">
            Contagem de pedidos concluídos em que os dois produtos apareceram
            juntos (não conta adicionais). Não é uma recomendação automática —
            é uma contagem simples pra você avaliar oportunidades de combo.
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
          <CardTitle className="text-base">Produtos comprados juntos com mais frequência</CardTitle>
          <CardDescription>{pairs.length} par(es) no período.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto A</TableHead>
                <TableHead>Produto B</TableHead>
                <TableHead className="text-right">Pedidos juntos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.map((pair) => (
                <TableRow key={`${pair.productA}|||${pair.productB}`}>
                  <TableCell className="max-w-[220px] truncate">{pair.productA}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{pair.productB}</TableCell>
                  <TableCell className="text-right">{pair.count}</TableCell>
                </TableRow>
              ))}
              {pairs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    Nenhum pedido no período teve dois ou mais produtos diferentes.
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
