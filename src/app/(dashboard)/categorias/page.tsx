import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { GlobalFilterBar } from "@/components/filters/global-filter-bar";
import { CategoryForm } from "./category-form";
import { CategoryTable, type CategoryRow } from "@/components/categorias/category-table";
import { DuplicateSuggestions, type DuplicateGroupForUi } from "@/components/categorias/duplicate-suggestions";
import { findExactDuplicateGroups, findNearDuplicatePairs } from "@/lib/metrics/category-duplicates";
import { CHANNEL_OPTIONS } from "@/lib/filters/types";
import type { Brand, Category, Product } from "@/types/database";

interface OrderItemRow {
  original_name: string;
  quantity: number;
  total_price: number;
  is_addon: boolean;
  status: string;
  ordered_at: string;
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selectedBrandId = typeof params.brand === "string" ? params.brand : null;

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
  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .order("canonical_name")
    .returns<Category[]>();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Product[]>();

  const productIds = (products ?? []).map((p) => p.id);
  const { data: storesForBrands } = await supabase.from("stores").select("id").in("brand_id", brandIds.length ? brandIds : fallback);
  const storeIds = (storesForBrands ?? []).map((s) => s.id);

  // Faturamento/pedidos/última venda por categoria — correspondência por
  // nome do produto (mesmo critério simplificado do resto do sistema, ver
  // METRICS_AUDIT.md), todo o histórico (não um período, igual RFM em
  // /clientes: categoria não é uma métrica de período).
  const { data: orderItemsRaw } = await supabase
    .from("orders")
    .select("status, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
    .in("store_id", storeIds.length ? storeIds : fallback)
    .limit(20000);

  interface OrderWithItems {
    status: string;
    ordered_at: string;
    order_items: { original_name: string; quantity: number; total_price: number; is_addon: boolean }[];
  }

  const orderItems: OrderItemRow[] = ((orderItemsRaw ?? []) as unknown as OrderWithItems[]).flatMap((o) =>
    o.order_items
      .filter((i) => !i.is_addon)
      .map((i) => ({ ...i, status: o.status, ordered_at: o.ordered_at }))
  );

  const categoryIdByProductName = new Map<string, string | null>();
  for (const p of products ?? []) categoryIdByProductName.set(p.canonical_name, p.category_id);

  const revenueByCategory = new Map<string, number>();
  const ordersByCategory = new Map<string, number>();
  const lastSoldByCategory = new Map<string, string>();

  for (const item of orderItems) {
    if (item.status !== "concluido") continue;
    const categoryId = categoryIdByProductName.get(item.original_name);
    if (!categoryId) continue;
    revenueByCategory.set(categoryId, (revenueByCategory.get(categoryId) ?? 0) + item.total_price);
    ordersByCategory.set(categoryId, (ordersByCategory.get(categoryId) ?? 0) + 1);
    const existing = lastSoldByCategory.get(categoryId);
    if (!existing || item.ordered_at > existing) lastSoldByCategory.set(categoryId, item.ordered_at);
  }

  // Origem/canal — plataformas dos canais de venda que já venderam produtos
  // desta categoria, via product_variants.
  interface VariantJoinRow {
    product_id: string | null;
    sales_channels: { platform: string } | { platform: string }[] | null;
  }
  const { data: variantsRaw } = await supabase
    .from("product_variants")
    .select("product_id, sales_channels(platform)")
    .in("product_id", productIds.length ? productIds : fallback)
    .returns<VariantJoinRow[]>();

  const categoryIdByProductId = new Map((products ?? []).map((p) => [p.id, p.category_id]));
  const channelsByCategory = new Map<string, Set<string>>();
  for (const v of variantsRaw ?? []) {
    if (!v.product_id) continue;
    const categoryId = categoryIdByProductId.get(v.product_id);
    if (!categoryId) continue;
    const channel = Array.isArray(v.sales_channels) ? v.sales_channels[0] : v.sales_channels;
    if (!channel) continue;
    const set = channelsByCategory.get(categoryId) ?? new Set<string>();
    set.add(CHANNEL_OPTIONS.find((o) => o.value === channel.platform)?.label ?? channel.platform);
    channelsByCategory.set(categoryId, set);
  }

  const productsByCategory = new Map<string, Product[]>();
  for (const p of products ?? []) {
    if (!p.category_id) continue;
    const list = productsByCategory.get(p.category_id) ?? [];
    list.push(p);
    productsByCategory.set(p.category_id, list);
  }

  const rows: CategoryRow[] = (categories ?? []).map((c) => {
    const categoryProducts = productsByCategory.get(c.id) ?? [];
    return {
      id: c.id,
      brandId: c.brand_id,
      brandName: brandById.get(c.brand_id)?.name ?? "—",
      canonicalName: c.canonical_name,
      productCount: categoryProducts.length,
      activeProductCount: categoryProducts.filter((p) => p.is_active).length,
      revenue: revenueByCategory.get(c.id) ?? 0,
      orders: ordersByCategory.get(c.id) ?? 0,
      lastSoldAt: lastSoldByCategory.get(c.id) ?? null,
      channels: [...(channelsByCategory.get(c.id) ?? [])],
    };
  });

  // Sugestões de duplicidade — exata (alta confiança) e quase-duplicata
  // (confiança média), nunca mescladas automaticamente.
  const duplicateInputs = (categories ?? []).map((c) => ({ id: c.id, brandId: c.brand_id, canonicalName: c.canonical_name }));
  const exactGroups = findExactDuplicateGroups(duplicateInputs);
  const nearPairs = findNearDuplicatePairs(duplicateInputs);
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const duplicateGroups: DuplicateGroupForUi[] = [
    ...exactGroups.map((g) => ({
      brandName: brandById.get(g.brandId)?.name ?? "—",
      confidence: "alta" as const,
      categories: g.categories.map((c) => ({ id: c.id, canonicalName: c.canonicalName, productCount: rowById.get(c.id)?.productCount ?? 0 })),
    })),
    ...nearPairs.map((pair) => ({
      brandName: brandById.get(pair.brandId)?.name ?? "—",
      confidence: "média" as const,
      categories: [
        { id: pair.a.id, canonicalName: pair.a.canonicalName, productCount: rowById.get(pair.a.id)?.productCount ?? 0 },
        { id: pair.b.id, canonicalName: pair.b.canonicalName, productCount: rowById.get(pair.b.id)?.productCount ?? 0 },
      ],
    })),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
        <p className="text-sm text-muted-foreground">
          Gerenciamento de categorias — produtos, faturamento e pedidos vêm de todo o
          histórico sincronizado (não um período), mesma base de /clientes.
        </p>
      </div>

      <GlobalFilterBar fields={["brand"]} brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} currentBrandId={selectedBrandId} />

      <DuplicateSuggestions groups={duplicateGroups} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryForm brands={brands ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryTable rows={rows} allCategories={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
