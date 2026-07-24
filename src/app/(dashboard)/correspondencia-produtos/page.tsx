import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { bestMatch } from "@/lib/products/similarity";
import { VariantRow } from "./variant-row";
import { BulkResolveButton } from "./bulk-resolve-button";
import type { Brand, Category, Product } from "@/types/database";

interface VariantJoinRow {
  id: string;
  original_name: string;
  raw_payload: { price?: number | null; category_name?: string | null } | null;
  sales_channels: {
    platform: string;
    stores: {
      brand_id: string;
    } | null;
  } | null;
}

export default async function ProductMatchingPage() {
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

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Product[]>();

  const { data: pendingVariants } = await supabase
    .from("product_variants")
    .select("id, original_name, raw_payload, sales_channels(platform, stores(brand_id))")
    .eq("match_status", "pendente")
    .returns<VariantJoinRow[]>();

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Category[]>();

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));
  const categoriesByBrand = new Map<string, Category[]>();
  for (const c of categories ?? []) {
    const list = categoriesByBrand.get(c.brand_id) ?? [];
    list.push(c);
    categoriesByBrand.set(c.brand_id, list);
  }
  const productsByBrand = new Map<string, Product[]>();
  for (const p of products ?? []) {
    const list = productsByBrand.get(p.brand_id) ?? [];
    list.push(p);
    productsByBrand.set(p.brand_id, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Correspondência de produtos</h1>
          <p className="text-sm text-muted-foreground">
            Variantes de produto vindas de diferentes plataformas (ex.: &quot;Combo Chef
            100 peças&quot; no Anota AI vs. &quot;CHEF 100 UN&quot; no iFood) esperando
            vínculo manual com um produto canônico. Nenhum vínculo é confirmado
            automaticamente — a sugestão é só uma ordenação por similaridade de texto.
          </p>
        </div>
        <BulkResolveButton pendingCount={(pendingVariants ?? []).length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pendentes de revisão</CardTitle>
          <CardDescription>{(pendingVariants ?? []).length} variante(s) sem vínculo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(pendingVariants ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma variante pendente. Elas aparecem aqui quando um adaptador de
              integração (Fase 3) ou uma importação de cardápio cria variantes de
              produto sem correspondência automática segura.
            </p>
          )}
          {(pendingVariants ?? []).map((variant) => {
            const brandId = variant.sales_channels?.stores?.brand_id;
            if (!brandId) return null;
            const brand = brandById.get(brandId);
            const candidates = productsByBrand.get(brandId) ?? [];
            const match = bestMatch(variant.original_name, candidates, (p) => p.canonical_name);
            const categoryName = variant.raw_payload?.category_name ?? null;
            const matchingCategory = categoryName
              ? (categoriesByBrand.get(brandId) ?? []).find(
                  (c) => c.canonical_name.toLowerCase() === categoryName.toLowerCase()
                )
              : undefined;

            return (
              <VariantRow
                key={variant.id}
                variantId={variant.id}
                originalName={variant.original_name}
                brandId={brandId}
                brandName={brand?.name ?? "—"}
                platform={variant.sales_channels?.platform ?? "—"}
                products={candidates.map((p) => ({ id: p.id, canonical_name: p.canonical_name }))}
                suggestion={match ? { productId: match.item.id, name: match.item.canonical_name, score: match.score } : null}
                price={variant.raw_payload?.price ?? null}
                categoryName={categoryName}
                categoryId={matchingCategory?.id ?? null}
              />
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
