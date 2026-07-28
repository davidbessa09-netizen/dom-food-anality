/** Normaliza texto pra comparacao de busca "tolerante": minusculas, sem
 * acento, sem espaco duplicado, sem espaco nas pontas. Usado pela busca de
 * produto em /produtos (e em qualquer outro campo de busca livre que
 * precise ignorar acento/caixa/espacamento). */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Verdadeiro quando todo termo de query (separado por espaco) aparece em
 * target, ja normalizados - permite buscar "combo mix pureza" e casar com
 * "COMBO MIX (100 PECAS) + 1 Pureza 1lt" mesmo fora de ordem exata. */
export function matchesSearch(target: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const normalizedTarget = normalizeSearchText(target);
  return normalizedQuery.split(" ").every((term) => normalizedTarget.includes(term));
}
