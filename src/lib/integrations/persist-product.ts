import type { createClient } from "@/lib/supabase/server";
import type { NormalizedProduct } from "@/lib/integrations/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Encontra a categoria pelo nome (case-insensitive) dentro da marca, ou cria. */
export async function findOrCreateCategory(
  supabase: SupabaseServerClient,
  brandId: string,
  canonicalName: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("brand_id", brandId)
    .ilike("canonical_name", canonicalName)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("categories")
    .insert({ brand_id: brandId, canonical_name: canonicalName })
    .select("id")
    .single();

  if (error || !created) return null;
  return created.id as string;
}

export interface PersistProductResult {
  ok: boolean;
  message?: string;
}

/**
 * Grava uma variante de produto (upsert por `sales_channel_id +
 * source_external_id`) SEM vincular a um produto canônico — isso fica
 * pendente de aprovação manual em "Correspondência de produtos" (nunca
 * confirmamos automaticamente uma correspondência duvidosa). Preço e
 * categoria de origem ficam em `raw_payload` até a aprovação, quando são
 * transferidos para o produto canônico.
 */
export async function persistNormalizedProduct(
  supabase: SupabaseServerClient,
  product: NormalizedProduct
): Promise<PersistProductResult> {
  const { data: existing } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .eq("sales_channel_id", product.sales_channel_id)
    .eq("source_external_id", product.source_external_id)
    .maybeSingle();

  const rawPayload = {
    price: product.price ?? null,
    category_name: product.category_name ?? null,
    synced_at: product.synced_at,
  };

  if (existing) {
    const { error } = await supabase
      .from("product_variants")
      .update({ original_name: product.original_name, raw_payload: rawPayload, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { ok: !error, message: error?.message };
  }

  const { error } = await supabase.from("product_variants").insert({
    sales_channel_id: product.sales_channel_id,
    source_external_id: product.source_external_id,
    original_name: product.original_name,
    match_status: "pendente",
    raw_payload: rawPayload,
  });

  return { ok: !error, message: error?.message };
}
