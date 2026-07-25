"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createProductSchema, updateProductSchema } from "@/lib/validations/catalog";

export interface ProductFormState {
  error?: string;
  success?: boolean;
}

export async function createProduct(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const parsed = createProductSchema.safeParse({
    brand_id: formData.get("brand_id"),
    category_id: formData.get("category_id") || undefined,
    canonical_name: formData.get("canonical_name"),
    current_price: formData.get("current_price") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    brand_id: parsed.data.brand_id,
    category_id: parsed.data.category_id || null,
    canonical_name: parsed.data.canonical_name,
    current_price: parsed.data.current_price ?? null,
  });

  if (error) {
    return { error: "Não foi possível criar o produto. Verifique se você tem permissão para esta marca." };
  }

  revalidatePath("/produtos");
  return { success: true };
}

export async function updateProduct(
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const parsed = updateProductSchema.safeParse({
    id: formData.get("id"),
    category_id: formData.get("category_id") || undefined,
    canonical_name: formData.get("canonical_name"),
    current_price: formData.get("current_price") || undefined,
    is_active: formData.get("is_active") === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      category_id: parsed.data.category_id || null,
      canonical_name: parsed.data.canonical_name,
      current_price: parsed.data.current_price ?? null,
      is_active: parsed.data.is_active,
    })
    .eq("id", parsed.data.id);

  if (error) {
    return { error: "Não foi possível salvar o produto. Verifique se você tem permissão para esta marca." };
  }

  revalidatePath("/produtos");
  return { success: true };
}

export async function toggleProductActive(productId: string, nextActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ is_active: nextActive }).eq("id", productId);
  revalidatePath("/produtos");
  return { ok: !error, error: error?.message };
}

export async function deleteProduct(productId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", productId);
  revalidatePath("/produtos");
  return { ok: !error, error: error?.message };
}
