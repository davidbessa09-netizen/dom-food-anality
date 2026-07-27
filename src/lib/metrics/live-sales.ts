// "Produtos vendidos ao vivo" (/produtos) — funções puras de agregação.
// Regra central: NUNCA confundir unidades vendidas, número de pedidos,
// faturamento e clientes — cada um é contado separadamente (ver
// METRICS_AUDIT.md). Adicionais (is_addon) nunca entram na agregação de
// produto principal por padrão.

export type SaleStatusMode = "confirmadas" | "em_andamento" | "canceladas";

const CONFIRMED_STATUSES = new Set(["concluido"]);
const IN_PROGRESS_STATUSES = new Set(["criado", "confirmado", "em_preparo", "saiu_para_entrega"]);
const CANCELLED_STATUSES = new Set(["cancelado"]);

export function statusesForMode(mode: SaleStatusMode): Set<string> {
  if (mode === "confirmadas") return CONFIRMED_STATUSES;
  if (mode === "em_andamento") return IN_PROGRESS_STATUSES;
  return CANCELLED_STATUSES;
}

export interface SaleItemEvent {
  orderId: string;
  orderedAt: string;
  status: string;
  storeId: string;
  storeName: string;
  channel: string;
  paymentMethod: string | null;
  fulfillment: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  isAddon: boolean;
}

export function filterByStatusMode(events: SaleItemEvent[], mode: SaleStatusMode, includeAddons = false): SaleItemEvent[] {
  const set = statusesForMode(mode);
  return events.filter((e) => set.has(e.status) && (includeAddons || !e.isAddon));
}

export interface ProductSalesSummary {
  productName: string;
  quantity: number;
  orders: number;
  revenue: number;
  avgPrice: number | null;
  lastSoldAt: string;
  topStoreName: string | null;
  topChannel: string | null;
}

/** Agrupa eventos (já filtrados por status/modo) por nome de produto —
 * quantidade é a soma real de `quantity` de cada item, pedidos é a
 * contagem de order_id DISTINTOS (nunca o mesmo número). */
export function buildProductSalesSummaries(events: SaleItemEvent[]): ProductSalesSummary[] {
  interface Acc {
    quantity: number;
    orderIds: Set<string>;
    revenue: number;
    lastSoldAt: string;
    revenueByStore: Map<string, number>;
    revenueByChannel: Map<string, number>;
  }
  const byName = new Map<string, Acc>();

  for (const e of events) {
    const acc = byName.get(e.productName) ?? {
      quantity: 0,
      orderIds: new Set<string>(),
      revenue: 0,
      lastSoldAt: e.orderedAt,
      revenueByStore: new Map<string, number>(),
      revenueByChannel: new Map<string, number>(),
    };
    acc.quantity += e.quantity;
    acc.orderIds.add(e.orderId);
    acc.revenue += e.totalPrice;
    if (e.orderedAt > acc.lastSoldAt) acc.lastSoldAt = e.orderedAt;
    acc.revenueByStore.set(e.storeName, (acc.revenueByStore.get(e.storeName) ?? 0) + e.totalPrice);
    acc.revenueByChannel.set(e.channel, (acc.revenueByChannel.get(e.channel) ?? 0) + e.totalPrice);
    byName.set(e.productName, acc);
  }

  function topKey(map: Map<string, number>): string | null {
    let best: string | null = null;
    let bestValue = -Infinity;
    for (const [key, value] of map) {
      if (value > bestValue) {
        best = key;
        bestValue = value;
      }
    }
    return best;
  }

  return Array.from(byName.entries()).map(([productName, acc]) => ({
    productName,
    quantity: acc.quantity,
    orders: acc.orderIds.size,
    revenue: acc.revenue,
    avgPrice: acc.quantity > 0 ? acc.revenue / acc.quantity : null,
    lastSoldAt: acc.lastSoldAt,
    topStoreName: topKey(acc.revenueByStore),
    topChannel: topKey(acc.revenueByChannel),
  }));
}

export interface OverallIndicators {
  unitsSold: number;
  distinctProducts: number;
  completedOrders: number;
  revenue: number;
  topSellingProductByQuantity: string | null;
  topSellingProductByRevenue: string | null;
  cancelledUnits: number;
}

export function buildOverallIndicators(confirmedEvents: SaleItemEvent[], cancelledEvents: SaleItemEvent[]): OverallIndicators {
  const summaries = buildProductSalesSummaries(confirmedEvents);
  const unitsSold = summaries.reduce((sum, s) => sum + s.quantity, 0);
  const revenue = summaries.reduce((sum, s) => sum + s.revenue, 0);
  const completedOrders = new Set(confirmedEvents.map((e) => e.orderId)).size;
  const cancelledUnits = cancelledEvents.reduce((sum, e) => sum + e.quantity, 0);

  const topByQuantity = summaries.length ? [...summaries].sort((a, b) => b.quantity - a.quantity)[0].productName : null;
  const topByRevenue = summaries.length ? [...summaries].sort((a, b) => b.revenue - a.revenue)[0].productName : null;

  return {
    unitsSold,
    distinctProducts: summaries.length,
    completedOrders,
    revenue,
    topSellingProductByQuantity: topByQuantity,
    topSellingProductByRevenue: topByRevenue,
    cancelledUnits,
  };
}

export interface OrderFeedGroup {
  orderId: string;
  orderedAt: string;
  status: string;
  storeName: string;
  channel: string;
  firstProductName: string;
  itemCount: number;
  totalQuantity: number;
  totalValue: number;
  items: SaleItemEvent[];
}

/** Agrupa eventos por pedido pra exibição compacta na "vendas acontecendo
 * agora" — evita listar cada item de um pedido com vários produtos como
 * linhas separadas (ex.: "Combo Mix + 3 itens", detalhes sob demanda). Usa
 * o horário do primeiro item de cada pedido pra ordenação. */
export function groupEventsByOrder(events: SaleItemEvent[]): OrderFeedGroup[] {
  const byOrder = new Map<string, OrderFeedGroup>();

  for (const e of events) {
    const existing = byOrder.get(e.orderId);
    if (existing) {
      existing.itemCount += 1;
      existing.totalQuantity += e.quantity;
      existing.totalValue += e.totalPrice;
      existing.items.push(e);
      if (e.orderedAt < existing.orderedAt) existing.orderedAt = e.orderedAt;
    } else {
      byOrder.set(e.orderId, {
        orderId: e.orderId,
        orderedAt: e.orderedAt,
        status: e.status,
        storeName: e.storeName,
        channel: e.channel,
        firstProductName: e.productName,
        itemCount: 1,
        totalQuantity: e.quantity,
        totalValue: e.totalPrice,
        items: [e],
      });
    }
  }

  return Array.from(byOrder.values()).sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
}

export interface GrowthRow {
  productName: string;
  currentQuantity: number;
  previousQuantity: number;
  growth: number;
}

/**
 * Só compara produtos que já tinham venda (quantidade > 0) no período
 * ANTERIOR — isso exclui automaticamente produtos recém-cadastrados (sem
 * histórico anterior pra comparar) sem precisar de outra fonte de dado.
 * O chamador é responsável por já ter removido produtos inativos/adicional
 * antes de passar os resumos aqui (mesmo critério de src/lib/metrics/
 * product-performance.ts).
 */
export function buildGrowthComparison(
  current: ProductSalesSummary[],
  previous: ProductSalesSummary[]
): { growing: GrowthRow[]; declining: GrowthRow[] } {
  const previousByName = new Map(previous.map((p) => [p.productName, p.quantity]));
  const rows: GrowthRow[] = [];

  for (const c of current) {
    const previousQuantity = previousByName.get(c.productName);
    if (previousQuantity === undefined || previousQuantity <= 0) continue;
    const growth = (c.quantity - previousQuantity) / previousQuantity;
    rows.push({ productName: c.productName, currentQuantity: c.quantity, previousQuantity, growth });
  }

  const growing = rows.filter((r) => r.growth > 0).sort((a, b) => b.growth - a.growth);
  const declining = rows.filter((r) => r.growth < 0).sort((a, b) => a.growth - b.growth);

  return { growing, declining };
}
