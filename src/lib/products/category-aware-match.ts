// Sugestão de correspondência considerando marca E categoria — nunca só
// similaridade textual (ver METRICS_AUDIT.md e a auditoria de
// correspondência de produtos). O chamador já deve ter filtrado os
// candidatos pela MESMA marca antes de chegar aqui (esta função nunca cruza
// marca, só decide entre candidatos que o chamador já sabe serem da marca
// certa) — quando a categoria de origem é conhecida, só considera
// candidatos da mesma categoria; se nenhum candidato compartilha a
// categoria, cai para todos os candidatos da marca, mas marca
// `categoryMatches: false` pra sinalizar ao revisor humano.

import { similarity } from "./similarity";

export interface CandidateProductWithCategory {
  id: string;
  canonical_name: string;
  category_name: string | null;
}

export interface CategoryAwareSuggestion {
  productId: string;
  name: string;
  score: number;
  /** true = mesma categoria; false = categoria diferente (revisar com atenção);
   * null = não dá pra avaliar (falta categoria de um dos lados). */
  categoryMatches: boolean | null;
}

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

export function bestMatchWithCategory(
  variantName: string,
  variantCategoryName: string | null,
  candidates: CandidateProductWithCategory[]
): CategoryAwareSuggestion | null {
  if (candidates.length === 0) return null;

  const sameCategory = variantCategoryName
    ? candidates.filter((c) => c.category_name && normalizeCategoryName(c.category_name) === normalizeCategoryName(variantCategoryName))
    : [];

  const pool = sameCategory.length > 0 ? sameCategory : candidates;

  let best: { item: CandidateProductWithCategory; score: number } | null = null;
  for (const item of pool) {
    const score = similarity(variantName, item.canonical_name);
    if (!best || score > best.score) best = { item, score };
  }
  if (!best || best.score <= 0) return null;

  const categoryMatches =
    !variantCategoryName || !best.item.category_name
      ? null
      : normalizeCategoryName(best.item.category_name) === normalizeCategoryName(variantCategoryName);

  return { productId: best.item.id, name: best.item.canonical_name, score: best.score, categoryMatches };
}

/** Um vínculo só é seguro pra resolução em lote quando o score passa do
 * limite E a categoria não é conhecidamente diferente (categoryMatches
 * !== false). Sem informação de categoria (null) ainda é considerado
 * seguro só pelo texto — o risco novo que esta função existe pra evitar é
 * o caso em que SABEMOS que a categoria diverge. */
export function isSafeForBulkResolution(suggestion: CategoryAwareSuggestion | null, threshold: number): boolean {
  if (!suggestion) return false;
  if (suggestion.score < threshold) return false;
  if (suggestion.categoryMatches === false) return false;
  return true;
}
