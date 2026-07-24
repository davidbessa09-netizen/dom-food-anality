import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { findDuplicateCategories, type CategoryInput } from "@/lib/metrics/data-quality";
import type { Brand } from "@/types/database";

function formatPercent(part: number, total: number): string {
  if (total === 0) return "—";
  return `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export default async function DataQualityPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .returns<Brand[]>();

  const brandIds = (brands ?? []).map((b) => b.id);
  const brandFallback = brandIds.length ? brandIds : fallback;

  const { data: stores } = await supabase.from("stores").select("id").in("brand_id", brandFallback);
  const storeIds = (stores ?? []).map((s) => s.id);
  const storeFallback = storeIds.length ? storeIds : fallback;

  const { count: pendingVariants } = await supabase
    .from("product_variants")
    .select("id, sales_channels!inner(stores!inner(brand_id))", { count: "exact", head: true })
    .eq("match_status", "pendente")
    .in("sales_channels.stores.brand_id", brandFallback);

  const { data: categories } = await supabase
    .from("categories")
    .select("id, brand_id, canonical_name")
    .in("brand_id", brandFallback)
    .returns<CategoryInput[]>();

  const duplicateCategoryGroups = findDuplicateCategories(categories ?? []);
  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));

  const { count: productsTotal } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .in("brand_id", brandFallback);

  const { count: productsWithoutPrice } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .in("brand_id", brandFallback)
    .is("current_price", null);

  const { count: ordersTotal } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("store_id", storeFallback);

  const { count: ordersWithoutCustomer } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("store_id", storeFallback)
    .is("customer_id", null);

  const { count: deliveryOrdersTotal } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("store_id", storeFallback)
    .eq("fulfillment_type", "entrega");

  const { count: deliveryOrdersWithoutNeighborhood } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("store_id", storeFallback)
    .eq("fulfillment_type", "entrega")
    .is("neighborhood_raw", null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Qualidade dos dados</h1>
        <p className="text-sm text-muted-foreground">
          Lacunas reais no dado já coletado — nenhum número aqui é estimado.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Variantes pendentes de correspondência</CardDescription>
            <CardTitle className="text-3xl">{pendingVariants ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Ver em Correspondência de produtos</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Produtos sem preço cadastrado</CardDescription>
            <CardTitle className="text-3xl">{productsWithoutPrice ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatPercent(productsWithoutPrice ?? 0, productsTotal ?? 0)} de {productsTotal ?? 0} produto(s)
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pedidos sem cliente identificado</CardDescription>
            <CardTitle className="text-3xl">{ordersWithoutCustomer ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatPercent(ordersWithoutCustomer ?? 0, ordersTotal ?? 0)} de {ordersTotal ?? 0} pedido(s)
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entregas sem bairro informado</CardDescription>
            <CardTitle className="text-3xl">{deliveryOrdersWithoutNeighborhood ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatPercent(deliveryOrdersWithoutNeighborhood ?? 0, deliveryOrdersTotal ?? 0)} de{" "}
            {deliveryOrdersTotal ?? 0} entrega(s)
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias possivelmente duplicadas</CardTitle>
          <CardDescription>
            Mesmo nome (ignorando maiúsculas/minúsculas) cadastrado mais de uma vez na
            mesma marca — provável falha de mesclagem, vale revisar em Categorias.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {duplicateCategoryGroups.map((group) => (
            <div key={`${group.brandId}-${group.name}`} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
              <Badge variant="outline">{brandById.get(group.brandId)?.name ?? "—"}</Badge>
              <span className="font-medium">{group.name}</span>
              <span className="text-xs text-muted-foreground">{group.ids.length} registro(s) duplicado(s)</span>
            </div>
          ))}
          {duplicateCategoryGroups.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma categoria duplicada encontrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
