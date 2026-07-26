import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { bestMatchWithCategory, isSafeForBulkResolution, type CandidateProductWithCategory } from "@/lib/products/category-aware-match";
import { PendingVariantCard } from "@/app/(dashboard)/correspondencia-produtos/pending-variant-card";
import { BulkResolveButton } from "@/app/(dashboard)/correspondencia-produtos/bulk-resolve-button";
import type { Brand, Category, Product } from "@/types/database";

const BULK_MATCH_THRESHOLD = 0.85;

interface VariantJoinRow {
  id: string;
  original_name: string;
  raw_payload: { price?: number | null; category_name?: string | null } | null;
  sales_channels: {
    platform: string;
    stores: {
      id: string;
      name: string;
      brand_id: string;
    } | null;
  } | null;
}

/**
 * Conteúdo da aba "Variações/correspondências" de /produtos — mesma lógica
 * de /correspondencia-produtos, extraída aqui pra ser reusada nos dois
 * lugares sem duplicar a query (ver METRICS_AUDIT.md sobre reuso).
 */
export async function VariantsTabContent({ brandIds }: { brandIds: string[] }) {
  const supabase = await createClient();
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("id", brandIds.length ? brandIds : fallback)
    .returns<Brand[]>();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Product[]>();

  const { data: pendingVariants } = await supabase
    .from("product_variants")
    .select("id, original_name, raw_payload, sales_channels(platform, stores(id, name, brand_id))")
    .eq("match_status", "pendente")
    .returns<VariantJoinRow[]>();

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Category[]>();

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));
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
  const candidatesByBrand = new Map<string, CandidateProductWithCategory[]>();
  for (const p of products ?? []) {
    const list = candidatesByBrand.get(p.brand_id) ?? [];
    list.push({ id: p.id, canonical_name: p.canonical_name, category_name: p.category_id ? categoryById.get(p.category_id)?.canonical_name ?? null : null });
    candidatesByBrand.set(p.brand_id, list);
  }

  const relevantVariants = (pendingVariants ?? []).filter((v) => {
    const brandId = v.sales_channels?.stores?.brand_id;
    return brandId && (brandIds.length === 0 || brandIds.includes(brandId));
  });

  // Impacto real em pedidos/faturamento por nome de item — mesma
  // correspondência simplificada por nome usada no resto do sistema (ver
  // METRICS_AUDIT.md). Uma única query pra todas as marcas em vez de uma
  // por variante.
  const { data: stores } = await supabase.from("stores").select("id").in("brand_id", brandIds.length ? brandIds : fallback);
  const storeIds = (stores ?? []).map((s) => s.id);
  const { data: orderItemsRaw } = await supabase
    .from("orders")
    .select("status, order_items(original_name, total_price, is_addon)")
    .in("store_id", storeIds.length ? storeIds : fallback)
    .neq("status", "cancelado")
    .limit(20000);

  interface OrderWithItems {
    status: string;
    order_items: { original_name: string; total_price: number; is_addon: boolean }[];
  }
  const impactByName = new Map<string, { orders: number; revenue: number }>();
  for (const order of (orderItemsRaw ?? []) as unknown as OrderWithItems[]) {
    for (const item of order.order_items) {
      const existing = impactByName.get(item.original_name);
      if (existing) {
        existing.orders += 1;
        existing.revenue += item.total_price;
      } else {
        impactByName.set(item.original_name, { orders: 1, revenue: item.total_price });
      }
    }
  }

  let safeCount = 0;
  const cards = relevantVariants.map((variant) => {
    const brandId = variant.sales_channels!.stores!.brand_id;
    const brand = brandById.get(brandId);
    const candidates = candidatesByBrand.get(brandId) ?? [];
    const legacyCandidates = (productsByBrand.get(brandId) ?? []).map((p) => ({ id: p.id, canonical_name: p.canonical_name }));
    const categoryName = variant.raw_payload?.category_name ?? null;
    const suggestion = bestMatchWithCategory(variant.original_name, categoryName, candidates);
    if (isSafeForBulkResolution(suggestion, BULK_MATCH_THRESHOLD)) safeCount++;

    const matchingCategory = categoryName
      ? (categoriesByBrand.get(brandId) ?? []).find((c) => c.canonical_name.toLowerCase() === categoryName.toLowerCase())
      : undefined;

    return (
      <PendingVariantCard
        key={variant.id}
        variantId={variant.id}
        originalName={variant.original_name}
        brandId={brandId}
        brandName={brand?.name ?? "—"}
        storeName={variant.sales_channels?.stores?.name ?? "—"}
        platform={variant.sales_channels?.platform ?? "—"}
        products={legacyCandidates}
        suggestion={suggestion}
        price={variant.raw_payload?.price ?? null}
        categoryName={categoryName}
        categoryId={matchingCategory?.id ?? null}
        impact={impactByName.get(variant.original_name) ?? { orders: 0, revenue: 0 }}
      />
    );
  });

  if (relevantVariants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="size-4 text-success" /> Nenhuma correspondência pendente
          </CardTitle>
          <CardDescription>
            Última verificação: agora, ao carregar esta página. Toda variante nova gerada por
            sincronização aparece aqui automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link href="/produtos?tab=catalogo" className="font-medium text-primary hover:underline">
            Ver catálogo de produtos
          </Link>
          <Link href="/qualidade-dados" className="font-medium text-primary hover:underline">
            Ver qualidade dos dados
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Variantes de produto vindas de diferentes plataformas (ex.: &quot;Combo Chef 100
          peças&quot; no Anota AI vs. &quot;CHEF 100 UN&quot; no iFood) esperando vínculo manual com
          um produto canônico. A sugestão considera marca E categoria — nunca vincula
          automaticamente só por parecença de texto.
        </p>
        <BulkResolveButton pendingCount={relevantVariants.length} safeCount={safeCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pendentes de revisão</CardTitle>
          <CardDescription>{relevantVariants.length} variante(s) sem vínculo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">{cards}</CardContent>
      </Card>
    </div>
  );
}
