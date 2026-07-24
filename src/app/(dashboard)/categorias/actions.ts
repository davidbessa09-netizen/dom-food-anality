"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
