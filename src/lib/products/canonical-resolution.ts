import type { createClient } from "@/lib/supabase/server";

/**
 * Resolve o nome original de cada item de pedido pro nome CANÔNICO do
 * produto — mas só quando existe uma variante já APROVADA ligando esse nome
 * ao produto (ver product_variants.match_status). Nunca agrupa por
 * parecença de texto sozinha: nomes sem correspondência aprovada continuam
 * usando o próprio nome (e entram em `pendingNames`).
 */
export interface CanonicalResolution {
  /** original_name -> nome canônico (ou o próprio nome se não confirmado) */
  nameByOriginal: Map<string, string>;
  /** nomes originais (já resolvidos) ainda sem correspondência aprovada */
  pendingNames: Set<string>;
}

export async function resolveCanonicalNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productIds: string[]
): Promise<CanonicalResolution> {
  const fallback = ["00000000-0000-0000-0000-000000000000"];
  const nameByOriginal = new Map<string, string>();
  const pendingNames = new Set<string>();

  if (productIds.length === 0) return { nameByOriginal, pendingNames };

  const { data: products } = await supabase.from("products").select("id, canonical_name").in("id", productIds);
  const productById = new Map((products ?? []).map((p) => [p.id, p.canonical_name]));
  for (const canonicalName of productById.values()) {
    nameByOriginal.set(canonicalName, canonicalName);
  }

  const { data: variants } = await supabase
    .from("product_variants")
    .select("product_id, original_name, match_status")
    .in("product_id", productIds.length ? productIds : fallback);

  for (const v of variants ?? []) {
    if (v.match_status === "aprovado" && v.product_id) {
      const canonicalName = productById.get(v.product_id);
      if (canonicalName) {
        nameByOriginal.set(v.original_name, canonicalName);
        continue;
      }
    }
    if (!nameByOriginal.has(v.original_name)) {
      nameByOriginal.set(v.original_name, v.original_name);
      pendingNames.add(v.original_name);
    }
  }

  return { nameByOriginal, pendingNames };
}
