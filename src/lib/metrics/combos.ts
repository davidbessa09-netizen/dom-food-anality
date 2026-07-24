// Produtos comprados juntos (Fase 4) — contagem simples de coocorrência por
// pedido (market basket), não é recomendação de IA. Um par "Produto A +
// Produto B" conta 1 por pedido concluído em que ambos aparecem, não importa
// a quantidade de cada um.

export interface ComboOrderItemInput {
  order_id: string;
  original_name: string;
  is_addon?: boolean;
  order_status: string;
}

export interface ComboPairRow {
  productA: string;
  productB: string;
  count: number;
}

export function buildProductPairs(items: ComboOrderItemInput[]): ComboPairRow[] {
  const productsByOrder = new Map<string, Set<string>>();

  for (const item of items) {
    if (item.order_status !== "concluido" || item.is_addon) continue;
    const set = productsByOrder.get(item.order_id) ?? new Set<string>();
    set.add(item.original_name);
    productsByOrder.set(item.order_id, set);
  }

  const pairCounts = new Map<string, ComboPairRow>();

  for (const products of productsByOrder.values()) {
    if (products.size < 2) continue;
    const sorted = Array.from(products).sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|||${sorted[j]}`;
        const existing = pairCounts.get(key);
        if (existing) existing.count += 1;
        else pairCounts.set(key, { productA: sorted[i], productB: sorted[j], count: 1 });
      }
    }
  }

  return Array.from(pairCounts.values()).sort((a, b) => b.count - a.count);
}
