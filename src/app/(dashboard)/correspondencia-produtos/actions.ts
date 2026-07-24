"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bestMatch } from "@/lib/products/similarity";
import { findOrCreateCategory } from "@/lib/integrations/persist-product";

/** Acima deste score (Jaccard de tokens), o vínculo é considerado seguro o
 * suficiente para aprovação em lote sem revisão humana item a item. */
const BULK_MATCH_THRESHOLD = 0.85;

export async function approveVariantMatch(variantId: string, productId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_variants")
    .update({ product_id: productId, match_status: "aprovado" })
    .eq("id", variantId);

  revalidatePath("/correspondencia-produtos");
  return { ok: !error, error: error?.message };
}

export async function rejectVariantMatch(variantId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_variants")
    .update({ match_status: "rejeitado", product_id: null })
    .eq("id", variantId);

  revalidatePath("/correspondencia-produtos");
  return { ok: !error, error: error?.message };
}

export async function createProductFromVariant(
  variantId: string,
  brandId: string,
  canonicalName: string,
  categoryId?: string | null,
  currentPrice?: number | null
) {
  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      brand_id: brandId,
      canonical_name: canonicalName,
      category_id: categoryId || null,
      current_price: currentPrice ?? null,
    })
    .select("id")
    .single();

  if (productError || !product) {
    return { ok: false, error: productError?.message ?? "Falha ao criar produto" };
  }

  const { error: variantError } = await supabase
    .from("product_variants")
    .update({ product_id: product.id, match_status: "aprovado" })
    .eq("id", variantId);

  revalidatePath("/correspondencia-produtos");
  revalidatePath("/produtos");
  return { ok: !variantError, error: variantError?.message };
}

interface PendingVariantRow {
  id: string;
  original_name: string;
  raw_payload: { price?: number | null; category_name?: string | null } | null;
  sales_channels: { stores: { brand_id: string } | null } | null;
}

interface CandidateProduct {
  id: string;
  canonical_name: string;
}

export interface BulkResolveResult {
  linked: number;
  created: number;
  failed: number;
  total: number;
}

/**
 * Resolve todas as variantes pendentes de uma vez: vincula a um produto
 * existente quando a similaridade de nome é alta (>= BULK_MATCH_THRESHOLD),
 * senão cria um novo produto canônico a partir do nome original. Nunca
 * vincula com baixa confiança — nesse caso sempre cria um produto novo, que
 * o usuário pode depois mesclar manualmente se for duplicata.
 */
export async function bulkResolveVariants(): Promise<BulkResolveResult> {
  const supabase = await createClient();

  const { data: pendingVariants } = await supabase
    .from("product_variants")
    .select("id, original_name, raw_payload, sales_channels(stores(brand_id))")
    .eq("match_status", "pendente")
    .returns<PendingVariantRow[]>();

  if (!pendingVariants || pendingVariants.length === 0) {
    return { linked: 0, created: 0, failed: 0, total: 0 };
  }

  const brandIds = [
    ...new Set(pendingVariants.map((v) => v.sales_channels?.stores?.brand_id).filter((id): id is string => Boolean(id))),
  ];

  const { data: existingProducts } = await supabase
    .from("products")
    .select("id, brand_id, canonical_name")
    .in("brand_id", brandIds);

  const productsByBrand = new Map<string, CandidateProduct[]>();
  for (const p of existingProducts ?? []) {
    const list = productsByBrand.get(p.brand_id) ?? [];
    list.push({ id: p.id, canonical_name: p.canonical_name });
    productsByBrand.set(p.brand_id, list);
  }

  let linked = 0;
  let created = 0;
  let failed = 0;

  for (const variant of pendingVariants) {
    const brandId = variant.sales_channels?.stores?.brand_id;
    if (!brandId) {
      failed++;
      continue;
    }

    const candidates = productsByBrand.get(brandId) ?? [];
    const match = bestMatch(variant.original_name, candidates, (p) => p.canonical_name);

    if (match && match.score >= BULK_MATCH_THRESHOLD) {
      const { error } = await supabase
        .from("product_variants")
        .update({ product_id: match.item.id, match_status: "aprovado" })
        .eq("id", variant.id);
      if (error) failed++;
      else linked++;
      continue;
    }

    const canonicalName = variant.original_name.trim();
    const categoryName = variant.raw_payload?.category_name ?? null;
    const categoryId = categoryName ? await findOrCreateCategory(supabase, brandId, categoryName) : null;

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        brand_id: brandId,
        canonical_name: canonicalName,
        category_id: categoryId,
        current_price: variant.raw_payload?.price ?? null,
      })
      .select("id")
      .single();

    if (productError || !product) {
      failed++;
      continue;
    }

    const list = productsByBrand.get(brandId) ?? [];
    list.push({ id: product.id as string, canonical_name: canonicalName });
    productsByBrand.set(brandId, list);

    const { error: variantError } = await supabase
      .from("product_variants")
      .update({ product_id: product.id, match_status: "aprovado" })
      .eq("id", variant.id);

    if (variantError) failed++;
    else created++;
  }

  revalidatePath("/correspondencia-produtos");
  revalidatePath("/produtos");
  revalidatePath("/categorias");

  return { linked, created, failed, total: pendingVariants.length };
}
