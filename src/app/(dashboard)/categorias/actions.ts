"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/log";
import { createCategorySchema } from "@/lib/validations/catalog";

export interface CategoryFormState {
  error?: string;
  success?: boolean;
}

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const parsed = createCategorySchema.safeParse({
    brand_id: formData.get("brand_id"),
    canonical_name: formData.get("canonical_name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    brand_id: parsed.data.brand_id,
    canonical_name: parsed.data.canonical_name,
  });

  if (error) {
    return { error: "Não foi possível criar a categoria. Verifique se você tem permissão para esta marca." };
  }

  revalidatePath("/categorias");
  return { success: true };
}

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

/** Renomeia uma categoria — não afeta produtos, só o nome de exibição. */
export async function renameCategory(categoryId: string, newName: string): Promise<SimpleResult> {
  const trimmed = newName.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) return { ok: false, error: "Nome muito curto." };

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: category } = await supabase
    .from("categories")
    .select("id, brand_id, canonical_name, brands(organization_id)")
    .eq("id", categoryId)
    .maybeSingle();
  if (!category) return { ok: false, error: "Categoria não encontrada." };

  const { error } = await supabase.from("categories").update({ canonical_name: trimmed }).eq("id", categoryId);
  if (error) return { ok: false, error: error.message };

  const brandInfo = Array.isArray(category.brands) ? category.brands[0] : category.brands;
  await logAudit(supabase, {
    organizationId: brandInfo?.organization_id ?? "",
    actorUserId: user?.id ?? null,
    action: "rename_category",
    entityType: "category",
    entityId: categoryId,
    metadata: { from: category.canonical_name, to: trimmed },
  });

  revalidatePath("/categorias");
  return { ok: true };
}

/** Normaliza só espaçamento (trim + colapsa espaços duplos) — não mexe em
 * caixa/acento, já que isso é decisão do usuário via mesclagem, não uma
 * correção automática de exibição. */
export async function normalizeCategoryName(categoryId: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { data: category } = await supabase.from("categories").select("canonical_name").eq("id", categoryId).maybeSingle();
  if (!category) return { ok: false, error: "Categoria não encontrada." };

  const normalized = category.canonical_name.trim().replace(/\s+/g, " ");
  if (normalized === category.canonical_name) return { ok: true };

  return renameCategory(categoryId, normalized);
}

/** Exclui uma categoria só se não houver produto vinculado — a FK
 * products.category_id não tem ON DELETE CASCADE de propósito (perder o
 * vínculo de categoria de um produto não deveria ser efeito colateral de
 * excluir a categoria). Mova ou mescle os produtos primeiro. */
export async function deleteCategory(categoryId: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if ((count ?? 0) > 0) {
    return { ok: false, error: `Essa categoria tem ${count} produto(s) vinculado(s). Mova ou mescle antes de excluir.` };
  }

  const { data: category } = await supabase
    .from("categories")
    .select("id, canonical_name, brands(organization_id)")
    .eq("id", categoryId)
    .maybeSingle();

  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) return { ok: false, error: error.message };

  const brandInfo = category ? (Array.isArray(category.brands) ? category.brands[0] : category.brands) : null;
  if (brandInfo) {
    await logAudit(supabase, {
      organizationId: brandInfo.organization_id,
      actorUserId: user?.id ?? null,
      action: "delete_category",
      entityType: "category",
      entityId: categoryId,
      metadata: { name: category?.canonical_name },
    });
  }

  revalidatePath("/categorias");
  return { ok: true };
}

export interface CategoryProductOption {
  id: string;
  canonicalName: string;
}

/** Lista os produtos de uma categoria pro drawer "Mover produtos" — buscado
 * sob demanda (só quando o drawer abre), não pré-carregado por linha. */
export async function listCategoryProducts(categoryId: string): Promise<CategoryProductOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select("id, canonical_name").eq("category_id", categoryId).order("canonical_name");
  return (data ?? []).map((p) => ({ id: p.id, canonicalName: p.canonical_name }));
}

export interface ProductMove {
  productId: string;
  previousCategoryId: string | null;
}

async function moveProductsToCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productIds: string[],
  targetCategoryId: string | null
): Promise<ProductMove[]> {
  if (productIds.length === 0) return [];

  const { data: products } = await supabase.from("products").select("id, category_id").in("id", productIds);
  const moves: ProductMove[] = (products ?? []).map((p) => ({ productId: p.id, previousCategoryId: p.category_id }));

  const now = new Date().toISOString();
  // Fecha o registro de histórico aberto e abre um novo — nunca apaga
  // histórico, só acrescenta a transição real (inclusive quando é um
  // desfazimento de mesclagem, ver undoCategoryMerge).
  await supabase.from("product_category_history").update({ valid_to: now }).in("product_id", productIds).is("valid_to", null);
  await supabase.from("product_category_history").insert(
    productIds.map((productId) => ({ product_id: productId, category_id: targetCategoryId, valid_from: now }))
  );
  await supabase.from("products").update({ category_id: targetCategoryId }).in("id", productIds);

  return moves;
}

export interface MoveProductsResult {
  ok: boolean;
  error?: string;
  moves?: ProductMove[];
}

/** Move um conjunto específico de produtos pra outra categoria (ação
 * "Mover produtos" de uma categoria — diferente de mesclar categorias
 * inteiras). */
export async function moveProducts(productIds: string[], targetCategoryId: string): Promise<MoveProductsResult> {
  if (productIds.length === 0) return { ok: false, error: "Nenhum produto selecionado." };

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: targetCategory } = await supabase
    .from("categories")
    .select("id, brand_id, brands(organization_id)")
    .eq("id", targetCategoryId)
    .maybeSingle();
  if (!targetCategory) return { ok: false, error: "Categoria de destino não encontrada." };

  const moves = await moveProductsToCategory(supabase, productIds, targetCategoryId);

  const brandInfo = Array.isArray(targetCategory.brands) ? targetCategory.brands[0] : targetCategory.brands;
  await logAudit(supabase, {
    organizationId: brandInfo?.organization_id ?? "",
    actorUserId: user?.id ?? null,
    action: "move_products_category",
    entityType: "category",
    entityId: targetCategoryId,
    metadata: { productIds, count: productIds.length },
  });

  revalidatePath("/categorias");
  revalidatePath("/produtos");
  return { ok: true, moves };
}

export interface MergePreview {
  targetCategoryId: string;
  sourceCategoryIds: string[];
  productsToMove: number;
}

/** Só calcula o impacto (quantos produtos seriam movidos) — não altera nada.
 * Usado pelo diálogo de mesclagem pra mostrar a prévia antes da confirmação. */
export async function previewCategoryMerge(sourceCategoryIds: string[], targetCategoryId: string): Promise<MergePreview> {
  const supabase = await createClient();
  const sources = sourceCategoryIds.filter((id) => id !== targetCategoryId);
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .in("category_id", sources.length ? sources : ["00000000-0000-0000-0000-000000000000"]);

  return { targetCategoryId, sourceCategoryIds: sources, productsToMove: count ?? 0 };
}

export interface MergeCategoriesResult {
  ok: boolean;
  error?: string;
  moves?: ProductMove[];
}

/**
 * Mescla categorias: move todos os produtos das categorias-origem pra a
 * categoria-destino escolhida pelo usuário. NUNCA exclui as categorias de
 * origem automaticamente — elas ficam vazias e podem ser excluídas depois,
 * explicitamente, via a ação "Excluir" (preserva a origem do dado e mantém
 * a mesclagem revertível enquanto as categorias de origem ainda existirem).
 */
export async function mergeCategories(sourceCategoryIds: string[], targetCategoryId: string): Promise<MergeCategoriesResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const sources = sourceCategoryIds.filter((id) => id !== targetCategoryId);
  if (sources.length === 0) return { ok: false, error: "Selecione ao menos uma categoria de origem diferente do destino." };

  const { data: targetCategory } = await supabase
    .from("categories")
    .select("id, brand_id, canonical_name, brands(organization_id)")
    .eq("id", targetCategoryId)
    .maybeSingle();
  if (!targetCategory) return { ok: false, error: "Categoria de destino não encontrada." };

  const { data: products } = await supabase.from("products").select("id").in("category_id", sources);
  const productIds = (products ?? []).map((p) => p.id);
  const moves = await moveProductsToCategory(supabase, productIds, targetCategoryId);

  const brandInfo = Array.isArray(targetCategory.brands) ? targetCategory.brands[0] : targetCategory.brands;
  await logAudit(supabase, {
    organizationId: brandInfo?.organization_id ?? "",
    actorUserId: user?.id ?? null,
    action: "merge_categories",
    entityType: "category",
    entityId: targetCategoryId,
    metadata: { sourceCategoryIds: sources, targetCategoryId, productsMoved: productIds.length },
  });

  revalidatePath("/categorias");
  revalidatePath("/produtos");
  return { ok: true, moves };
}

/**
 * Desfaz uma mesclagem — só é oferecido na mesma sessão, logo após a ação
 * (ver merge-dialog.tsx), quando é "tecnicamente seguro": as categorias de
 * origem ainda existem (mesclar nunca as exclui) e nenhuma outra mudança de
 * categoria aconteceu nesses produtos desde então. Não apaga o histórico da
 * mesclagem — registra o desfazimento como uma nova transição real.
 */
export async function undoCategoryMerge(moves: ProductMove[]): Promise<SimpleResult> {
  if (moves.length === 0) return { ok: true };
  const supabase = await createClient();
  const user = await getCurrentUser();

  const now = new Date().toISOString();
  const productIds = moves.map((m) => m.productId);
  await supabase.from("product_category_history").update({ valid_to: now }).in("product_id", productIds).is("valid_to", null);
  await supabase.from("product_category_history").insert(
    moves.map((m) => ({ product_id: m.productId, category_id: m.previousCategoryId, valid_from: now }))
  );

  for (const move of moves) {
    await supabase.from("products").update({ category_id: move.previousCategoryId }).eq("id", move.productId);
  }

  const { data: firstProduct } = await supabase
    .from("products")
    .select("brand_id, brands(organization_id)")
    .eq("id", productIds[0])
    .maybeSingle();
  const brandInfo = firstProduct ? (Array.isArray(firstProduct.brands) ? firstProduct.brands[0] : firstProduct.brands) : null;
  if (brandInfo) {
    await logAudit(supabase, {
      organizationId: brandInfo.organization_id,
      actorUserId: user?.id ?? null,
      action: "undo_merge_categories",
      entityType: "category",
      entityId: productIds[0],
      metadata: { productsReverted: moves.length },
    });
  }

  revalidatePath("/categorias");
  revalidatePath("/produtos");
  return { ok: true };
}
