// Agrupamento de pedidos de entrega por bairro (ver METRICS.md).
// Usa o texto bruto recebido da origem (`neighborhood_raw`), sem tentar
// normalizar grafias diferentes do mesmo bairro — isso é trabalho futuro de
// correspondência manual (mesmo princípio de "correspondência de produtos"),
// não inferência automática.

const MISSING_NEIGHBORHOOD = "Bairro não informado";

export interface DeliveryOrderInput {
  neighborhood_raw: string | null;
  gross_amount: number;
  status: string;
}

export interface NeighborhoodRow {
  neighborhood: string;
  orders: number;
  revenue: number;
}

/** Só considera pedidos de entrega (fulfillment_type "entrega") que não foram cancelados. */
export function ordersByNeighborhood(orders: DeliveryOrderInput[]): NeighborhoodRow[] {
  const byNeighborhood = new Map<string, NeighborhoodRow>();

  for (const order of orders) {
    if (order.status === "cancelado") continue;
    const key = order.neighborhood_raw?.trim() || MISSING_NEIGHBORHOOD;
    const existing = byNeighborhood.get(key);
    if (existing) {
      existing.orders += 1;
      existing.revenue += order.gross_amount;
    } else {
      byNeighborhood.set(key, { neighborhood: key, orders: 1, revenue: order.gross_amount });
    }
  }

  return Array.from(byNeighborhood.values()).sort((a, b) => b.revenue - a.revenue);
}
