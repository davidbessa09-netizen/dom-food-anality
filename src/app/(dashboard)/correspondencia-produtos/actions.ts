"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/log";
import { bestMatchWithCategory, isSafeForBulkResolution, type CandidateProductWithCategory } from "@/lib/products/category-aware-match";

/** Acima deste score (Jaccard de tokens) E sem divergência conhecida de
 * categoria, o vínculo é considerado seguro o suficiente pra resolução em
 * lote sem revisão individual (ver category-aware-match.ts). */
const BULK_MATCH_THRESHOLD = 0.85;

export interface VariantActionResult {
  ok: boolean;
  error?: string;
  /** Estado anterior da variante — usado pelo botão "Desfazer" (toast). */
  previousState?: { matchStatus: string; productId: string | null };
  /** Preenchido só quando a ação criou um produto novo (pra permitir
   * desfazer também apagar o produto, se nada mais o referenciar). */
  createdProductId?: string;
}

async function getVariantOrgId(supabase: Awaited<ReturnType<typeof createClient>>, variantId: string): Promise<string | null> {
  const { data } = await supabase
    .from("product_variants")
    .select("sales_channels(stores(brands(organization_id)))")
    .eq("id", variantId)
    .maybeSingle();
  const channel = data ? (Array.isArray(data.sales_channels) ? data.sales_channels[0] : data.sales_channels) : null;
  const store = channel ? (Array.isArray(channel.stores) ? channel.stores[0] : channel.stores) : null;
  const brand = store ? (Array.isArray(store.brands) ? store.brands[0] : store.brands) : null;
  return brand?.organization_id ?? null;
}

export async function approveVariantMatch(variantId: string, productId: string): Promise<VariantActionResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: before } = await supabase.from("product_variants").select("match_status, product_id").eq("id", variantId).maybeSingle();

  const { error } = await supabase
    .from("product_variants")
    .update({ product_id: productId, match_status: "aprovado" })
    .eq("id", variantId);

  if (!error) {
    const orgId = await getVariantOrgId(supabase, variantId);
    if (orgId) {
      await logAudit(supabase, {
        organizationId: orgId,
        actorUserId: user?.id ?? null,
        action: "approve_variant_match",
        entityType: "product_variant",
        entityId: variantId,
        metadata: { product_id: productId },
      });
    }
  }

  revalidatePath("/correspondencia-produtos");
  revalidatePath("/produtos");
  return {
    ok: !error,
    error: error?.message,
    previousState: before ? { matchStatus: before.match_status, productId: before.product_id } : undefined,
  };
}

export async function rejectVariantMatch(variantId: string): Promise<VariantActionResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: before } = await supabase.from("product_variants").select("match_status, product_id").eq("id", variantId).maybeSingle();

  const { error } = await supabase
    .from("product_variants")
    .update({ match_status: "rejeitado", product_id: null })
    .eq("id", variantId);

  if (!error) {
    const orgId = await getVariantOrgId(supabase, variantId);
    if (orgId) {
      await logAudit(supabase, {
        organizationId: orgId,
        actorUserId: user?.id ?? null,
        action: "reject_variant_match",
        entityType: "product_variant",
        entityId: variantId,
      });
    }
  }

  revalidatePath("/correspondencia-produtos");
  return {
    ok: !error,
    error: error?.message,
    previousState: before ? { matchStatus: before.match_status, productId: before.product_id } : undefined,
  };
}

export async function createProductFromVariant(
  variantId: string,
  brandId: string,
  canonicalName: string,
  categoryId?: string | null,
  currentPrice?: number | null
): Promise<VariantActionResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: before } = await supabase.from("product_variants").select("match_status, product_id").eq("id", variantId).maybeSingle();

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

  if (!variantError) {
    const orgId = await getVariantOrgId(supabase, variantId);
    if (orgId) {
      await logAudit(supabase, {
        organizationId: orgId,
        actorUserId: user?.id ?? null,
        action: "create_product_from_variant",
        entityType: "product_variant",
        entityId: variantId,
        metadata: { product_id: product.id, canonical_name: canonicalName },
      });
    }
  }

  revalidatePath("/correspondencia-produtos");
  revalidatePath("/produtos");
  revalidatePath("/categorias");
  return {
    ok: !variantError,
    error: variantError?.message,
    previousState: before ? { matchStatus: before.match_status, productId: before.product_id } : undefined,
    createdProductId: product.id as string,
  };
}

/**
 * Desfaz aprovar/rejeitar/criar — restaura o status/vínculo anterior da
 * variante. Quando a ação original criou um produto (createdProductId
 * informado), também apaga esse produto, mas só se nenhuma OUTRA variante
 * ainda apontar pra ele (tecnicamente seguro: nada mais depende dele).
 */
export async function undoVariantAction(
  variantId: string,
  previousState: { matchStatus: string; productId: string | null },
  createdProductId?: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("product_variants")
    .update({ match_status: previousState.matchStatus, product_id: previousState.productId })
    .eq("id", variantId);

  if (error) return { ok: false, error: error.message };

  if (createdProductId) {
    const { count } = await supabase
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("product_id", createdProductId);
    if ((count ?? 0) === 0) {
      await supabase.from("products").delete().eq("id", createdProductId);
    }
  }

  const orgId = await getVariantOrgId(supabase, variantId);
  if (orgId) {
    await logAudit(supabase, {
      organizationId: orgId,
      actorUserId: user?.id ?? null,
      action: "undo_variant_action",
      entityType: "product_variant",
      entityId: variantId,
      metadata: { restored_status: previousState.matchStatus, deleted_product_id: createdProductId ?? null },
    });
  }

  revalidatePath("/correspondencia-produtos");
  revalidatePath("/produtos");
  revalidatePath("/categorias");
  return { ok: true };
}

interface PendingVariantRow {
  id: string;
  original_name: string;
  raw_payload: { price?: number | null; category_name?: string | null } | null;
  sales_channels: { stores: { brand_id: string } | null } | null;
}

export interface BulkResolveResult {
  linked: number;
  skipped: number;
  total: number;
}

/**
 * Resolve em lote SÓ os casos seguros: score de similaridade acima do
 * limite E sem divergência conhecida de categoria (ver
 * isSafeForBulkResolution). Nunca cria produto novo em lote — criar um
 * produto é uma decisão que fica pra revisão individual. Casos não seguros
 * continuam pendentes.
 */
export async function bulkResolveSafeMatches(): Promise<BulkResolveResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: pendingVariants } = await supabase
    .from("product_variants")
    .select("id, original_name, raw_payload, sales_channels(stores(brand_id))")
    .eq("match_status", "pendente")
    .returns<PendingVariantRow[]>();

  if (!pendingVariants || pendingVariants.length === 0) {
    return { linked: 0, skipped: 0, total: 0 };
  }

  const brandIds = [
    ...new Set(pendingVariants.map((v) => v.sales_channels?.stores?.brand_id).filter((id): id is string => Boolean(id))),
  ];

  const { data: existingProducts } = await supabase
    .from("products")
    .select("id, brand_id, canonical_name, category_id, categories(canonical_name)")
    .in("brand_id", brandIds.length ? brandIds : ["00000000-0000-0000-0000-000000000000"]);

  interface ProductJoinRow {
    id: string;
    brand_id: string;
    canonical_name: string;
    category_id: string | null;
    categories: { canonical_name: string } | { canonical_name: string }[] | null;
  }

  const productsByBrand = new Map<string, CandidateProductWithCategory[]>();
  for (const p of (existingProducts ?? []) as unknown as ProductJoinRow[]) {
    const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    const list = productsByBrand.get(p.brand_id) ?? [];
    list.push({ id: p.id, canonical_name: p.canonical_name, category_name: category?.canonical_name ?? null });
    productsByBrand.set(p.brand_id, list);
  }

  let linked = 0;
  let skipped = 0;
  const linkedVariantIds: string[] = [];

  for (const variant of pendingVariants) {
    const brandId = variant.sales_channels?.stores?.brand_id;
    if (!brandId) {
      skipped++;
      continue;
    }

    const candidates = productsByBrand.get(brandId) ?? [];
    const suggestion = bestMatchWithCategory(variant.original_name, variant.raw_payload?.category_name ?? null, candidates);

    if (!isSafeForBulkResolution(suggestion, BULK_MATCH_THRESHOLD) || !suggestion) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("product_variants")
      .update({ product_id: suggestion.productId, match_status: "aprovado" })
      .eq("id", variant.id);

    if (error) skipped++;
    else {
      linked++;
      linkedVariantIds.push(variant.id);
    }
  }

  if (linkedVariantIds.length > 0) {
    const orgId = await getVariantOrgId(supabase, linkedVariantIds[0]);
    if (orgId) {
      await logAudit(supabase, {
        organizationId: orgId,
        actorUserId: user?.id ?? null,
        action: "bulk_resolve_safe_matches",
        entityType: "product_variant",
        metadata: { linked, skipped, variantIds: linkedVariantIds },
      });
    }
  }

  revalidatePath("/correspondencia-produtos");
  revalidatePath("/produtos");
  revalidatePath("/categorias");

  return { linked, skipped, total: pendingVariants.length };
}
