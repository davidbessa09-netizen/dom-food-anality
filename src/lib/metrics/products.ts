// Funções puras de cálculo para o ranking de produtos (ver METRICS.md).
// O agrupamento usa o nome original do item (original_name), não o produto
// canônico — a correspondência entre plataformas é aprovada manualmente em
// "Correspondência de produtos" e não bloqueia o ranking básico.

export interface ProductOrderItemInput {
  original_name: string;
  quantity: number;
  total_price: number;
  is_addon?: boolean;
  order_status: string;
  ordered_at: string;
}

export interface ProductRankingRow {
  name: string;
  quantity: number;
  revenue: number;
  ordersCount: number;
  lastSoldAt: string;
}

/** Agrupa itens de pedidos CONCLUÍDOS por nome, somando quantidade e faturamento. */
export function buildProductRanking(items: ProductOrderItemInput[]): ProductRankingRow[] {
  const byName = new Map<string, ProductRankingRow>();

  for (const item of items) {
    if (item.order_status !== "concluido" || item.is_addon) continue;

    const existing = byName.get(item.original_name);
    if (existing) {
      existing.quantity += item.quantity;
      existing.revenue += item.total_price;
      existing.ordersCount += 1;
      if (item.ordered_at > existing.lastSoldAt) existing.lastSoldAt = item.ordered_at;
    } else {
      byName.set(item.original_name, {
        name: item.original_name,
        quantity: item.quantity,
        revenue: item.total_price,
        ordersCount: 1,
        lastSoldAt: item.ordered_at,
      });
    }
  }

  return Array.from(byName.values());
}

export function rankByQuantity(rows: ProductRankingRow[]): ProductRankingRow[] {
  return [...rows].sort((a, b) => b.quantity - a.quantity);
}

export function rankByRevenue(rows: ProductRankingRow[]): ProductRankingRow[] {
  return [...rows].sort((a, b) => b.revenue - a.revenue);
}

/** Produtos do catálogo que não venderam nada no período (não aparecem em `rows`). */
export function findProductsWithoutSales(
  catalogNames: string[],
  rows: ProductRankingRow[]
): string[] {
  const sold = new Set(rows.map((r) => r.name));
  return catalogNames.filter((name) => !sold.has(name));
}

/** Dias desde a última venda, a partir de "agora" (ISO) — usado pra alerta de produto parado. */
export function daysSinceLastSale(lastSoldAt: string, now: string): number {
  const diffMs = new Date(now).getTime() - new Date(lastSoldAt).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
