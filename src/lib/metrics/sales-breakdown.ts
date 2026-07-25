// Participação por canal e por forma de pagamento (ver METRICS_AUDIT.md) —
// mesma regra do resto do sistema: exclui cancelados, nunca divide por zero.

const CANCELLED = "cancelado";

export interface ChannelOrderInput {
  source_platform: string;
  gross_amount: number;
  status: string;
}

export interface ChannelRevenueRow {
  channel: string;
  revenue: number;
  orders: number;
  share: number; // 0-1, participação no faturamento não cancelado do recorte
}

export function revenueByChannel(orders: ChannelOrderInput[]): ChannelRevenueRow[] {
  const active = orders.filter((o) => o.status !== CANCELLED);
  const total = active.reduce((sum, o) => sum + o.gross_amount, 0);
  const byChannel = new Map<string, { revenue: number; orders: number }>();
  for (const o of active) {
    const existing = byChannel.get(o.source_platform);
    if (existing) {
      existing.revenue += o.gross_amount;
      existing.orders += 1;
    } else {
      byChannel.set(o.source_platform, { revenue: o.gross_amount, orders: 1 });
    }
  }
  return Array.from(byChannel.entries())
    .map(([channel, v]) => ({ channel, revenue: v.revenue, orders: v.orders, share: total > 0 ? v.revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface PaymentOrderInput {
  payment_method: string | null;
  gross_amount: number;
  status: string;
}

export interface PaymentRevenueRow {
  paymentMethod: string | null;
  revenue: number;
  orders: number;
  share: number;
}

export function revenueByPaymentMethod(orders: PaymentOrderInput[]): PaymentRevenueRow[] {
  const active = orders.filter((o) => o.status !== CANCELLED);
  const total = active.reduce((sum, o) => sum + o.gross_amount, 0);
  const byMethod = new Map<string, { revenue: number; orders: number }>();
  for (const o of active) {
    const key = o.payment_method ?? "__none__";
    const existing = byMethod.get(key);
    if (existing) {
      existing.revenue += o.gross_amount;
      existing.orders += 1;
    } else {
      byMethod.set(key, { revenue: o.gross_amount, orders: 1 });
    }
  }
  return Array.from(byMethod.entries())
    .map(([key, v]) => ({
      paymentMethod: key === "__none__" ? null : key,
      revenue: v.revenue,
      orders: v.orders,
      share: total > 0 ? v.revenue / total : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}
