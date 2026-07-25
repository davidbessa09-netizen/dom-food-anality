// Detecção de categorias duplicadas (ver METRICS_AUDIT.md) — duas camadas:
//
// - Duplicata exata (alta confiança): mesmo nome depois de normalizar
//   (minúsculas, sem acento, espaços colapsados) — cobre "bebidas" vs
//   "Bebidas" vs "BEBIDAS", ou "LINHA GOURMET" cadastrada duas vezes.
// - Quase-duplicata (confiança média): nomes normalizados DIFERENTES mas
//   com alta similaridade de tokens — cobre pequenas variações de grafia
//   (plural, abreviação). Nunca mescla sozinho: só sugere.
//
// Reusa normalizeProductName/similarity de products/similarity.ts — mesmo
// critério de normalização já usado (e já testado) pra produtos.

import { normalizeProductName, similarity } from "@/lib/products/similarity";

export interface CategoryDuplicateInput {
  id: string;
  brandId: string;
  canonicalName: string;
}

export interface ExactDuplicateGroup {
  brandId: string;
  normalizedName: string;
  categories: CategoryDuplicateInput[];
}

const NEAR_DUPLICATE_THRESHOLD = 0.5;

export function findExactDuplicateGroups(categories: CategoryDuplicateInput[]): ExactDuplicateGroup[] {
  const byKey = new Map<string, ExactDuplicateGroup>();

  for (const c of categories) {
    const normalizedName = normalizeProductName(c.canonicalName);
    const key = `${c.brandId}||${normalizedName}`;
    const existing = byKey.get(key);
    if (existing) existing.categories.push(c);
    else byKey.set(key, { brandId: c.brandId, normalizedName, categories: [c] });
  }

  return Array.from(byKey.values()).filter((g) => g.categories.length > 1);
}

export interface NearDuplicatePair {
  brandId: string;
  a: CategoryDuplicateInput;
  b: CategoryDuplicateInput;
  score: number;
}

/** Só compara categorias que NÃO já caem no mesmo grupo de duplicata exata
 * (evita sugerir de novo o que já é alta confiança) e da mesma marca. */
export function findNearDuplicatePairs(categories: CategoryDuplicateInput[]): NearDuplicatePair[] {
  const exactGroups = findExactDuplicateGroups(categories);
  const exactKeyByCategoryId = new Map<string, string>();
  for (const group of exactGroups) {
    for (const c of group.categories) exactKeyByCategoryId.set(c.id, group.normalizedName);
  }

  const byBrand = new Map<string, CategoryDuplicateInput[]>();
  for (const c of categories) {
    const list = byBrand.get(c.brandId) ?? [];
    list.push(c);
    byBrand.set(c.brandId, list);
  }

  const pairs: NearDuplicatePair[] = [];
  for (const [brandId, list] of byBrand) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (exactKeyByCategoryId.get(a.id) === exactKeyByCategoryId.get(b.id) && exactKeyByCategoryId.get(a.id) !== undefined) {
          continue; // já é duplicata exata, não repete como "quase"
        }
        const score = similarity(a.canonicalName, b.canonicalName);
        if (score >= NEAR_DUPLICATE_THRESHOLD && score < 1) {
          pairs.push({ brandId, a, b, score });
        }
      }
    }
  }

  return pairs.sort((x, y) => y.score - x.score);
}
