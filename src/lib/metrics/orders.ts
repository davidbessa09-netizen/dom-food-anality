// Funções puras de cálculo de métricas executivas (ver METRICS.md).
// Nenhuma delas acessa banco — recebem os dados já carregados e devolvem
// números + a classificação real/calculado/estimado correspondente.

export type OrderStatus =
  | "criado"
  | "confirmado"
  | "em_preparo"
  | "saiu_para_entrega"
  | "concluido"
  | "cancelado";

export interface OrderMetricInput {
  id: string;
  status: OrderStatus;
  gross_amount: number;
  net_amount: number | null;
  discount_amount: number;
  delivery_fee_amount: number;
  customer_id: string | null;
}

export interface OrderItemMetricInput {
  order_id: string;
  quantity: number;
  is_addon?: boolean;
}

const CANCELLED: OrderStatus = "cancelado";
const COMPLETED: OrderStatus = "concluido";

export function grossRevenue(orders: OrderMetricInput[]): number {
  return orders.filter((o) => o.status !== CANCELLED).reduce((sum, o) => sum + o.gross_amount, 0);
}

/** Retorna null ("dado indisponível") se nenhum pedido do recorte tiver net_amount informado. */
export function netRevenue(orders: OrderMetricInput[]): number | null {
  const withNet = orders.filter((o) => o.status !== CANCELLED && o.net_amount !== null);
  if (withNet.length === 0) return null;
  return withNet.reduce((sum, o) => sum + (o.net_amount ?? 0), 0);
}

export function totalOrders(orders: OrderMetricInput[]): number {
  return orders.length;
}

export function completedOrdersCount(orders: OrderMetricInput[]): number {
  return orders.filter((o) => o.status === COMPLETED).length;
}

export function cancelledOrdersCount(orders: OrderMetricInput[]): number {
  return orders.filter((o) => o.status === CANCELLED).length;
}

/** Retorna null quando não há nenhum pedido no recorte (evita 0/0). */
export function cancellationRate(orders: OrderMetricInput[]): number | null {
  if (orders.length === 0) return null;
  return cancelledOrdersCount(orders) / orders.length;
}

/** Ticket médio = faturamento bruto / pedidos concluídos. Null se não há concluídos. */
export function averageTicket(orders: OrderMetricInput[]): number | null {
  const completed = completedOrdersCount(orders);
  if (completed === 0) return null;
  const revenueFromCompleted = orders
    .filter((o) => o.status === COMPLETED)
    .reduce((sum, o) => sum + o.gross_amount, 0);
  return revenueFromCompleted / completed;
}

export function itemsPerOrder(orders: OrderMetricInput[], items: OrderItemMetricInput[]): number | null {
  const completed = completedOrdersCount(orders);
  if (completed === 0) return null;
  const completedIds = new Set(orders.filter((o) => o.status === COMPLETED).map((o) => o.id));
  const totalItems = items
    .filter((i) => completedIds.has(i.order_id))
    .reduce((sum, i) => sum + i.quantity, 0);
  return totalItems / completed;
}

export function discountsTotal(orders: OrderMetricInput[]): number {
  return orders.reduce((sum, o) => sum + o.discount_amount, 0);
}

export function deliveryFeesTotal(orders: OrderMetricInput[]): number {
  return orders.reduce((sum, o) => sum + o.delivery_fee_amount, 0);
}

export function uniqueCustomers(orders: OrderMetricInput[]): number {
  return new Set(orders.filter((o) => o.customer_id).map((o) => o.customer_id)).size;
}

/**
 * Clientes novos = clientes cuja primeira compra (em toda a história, não só
 * no período) caiu dentro do período analisado.
 * `firstOrderDateByCustomer` deve conter a data da primeira compra de cada
 * cliente considerando TODO o histórico sincronizado, não apenas o filtro.
 */
export function newCustomersCount(
  orders: OrderMetricInput[],
  firstOrderDateByCustomer: Map<string, string>,
  periodStart: string,
  periodEnd: string
): number {
  const customerIds = new Set(orders.filter((o) => o.customer_id).map((o) => o.customer_id!));
  let count = 0;
  for (const customerId of customerIds) {
    const firstDate = firstOrderDateByCustomer.get(customerId);
    if (firstDate && firstDate >= periodStart && firstDate <= periodEnd) count++;
  }
  return count;
}

export function returningCustomersCount(
  orders: OrderMetricInput[],
  firstOrderDateByCustomer: Map<string, string>,
  periodStart: string,
  periodEnd: string
): number {
  const total = uniqueCustomers(orders);
  const newOnes = newCustomersCount(orders, firstOrderDateByCustomer, periodStart, periodEnd);
  return total - newOnes;
}

export function repurchaseRate(
  orders: OrderMetricInput[],
  firstOrderDateByCustomer: Map<string, string>,
  periodStart: string,
  periodEnd: string
): number | null {
  const total = uniqueCustomers(orders);
  if (total === 0) return null;
  return returningCustomersCount(orders, firstOrderDateByCustomer, periodStart, periodEnd) / total;
}

/** Crescimento percentual vs. período anterior. Null se o período anterior for 0 (evita divisão por zero / infinito). */
export function growthRate(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
