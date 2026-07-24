/**
 * Similaridade simples (Jaccard sobre tokens normalizados) para sugerir
 * correspondências de produto entre plataformas. Nunca usada para confirmar
 * automaticamente — só para ordenar sugestões na tela de "Correspondência de
 * produtos" (aprovação sempre manual).
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function similarity(a: string, b: string): number {
  const tokensA = new Set(normalizeProductName(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeProductName(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarityMatch<T> {
  item: T;
  score: number;
}

export function bestMatch<T>(name: string, candidates: T[], getName: (item: T) => string): SimilarityMatch<T> | null {
  let best: SimilarityMatch<T> | null = null;
  for (const item of candidates) {
    const score = similarity(name, getName(item));
    if (!best || score > best.score) {
      best = { item, score };
    }
  }
  return best && best.score > 0 ? best : null;
}
