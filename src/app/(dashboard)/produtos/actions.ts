"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createProductSchema } from "@/lib/validations/catalog";

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
