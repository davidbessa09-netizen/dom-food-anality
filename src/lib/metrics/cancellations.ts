// Funções puras para o painel de Cancelamentos (ver METRICS.md).

const MISSING_REASON = "Motivo não informado";

export interface CancelledOrderInput {
  id: string;
  store_id: string;
  gross_amount: number;
  ordered_at: string; // ISO, usado pra hora do dia
  reason: string | null;
}

export interface StoreCancellationRow {
  storeId: string;
  count: number;
  lostAmount: number;
}

export function cancellationsByStore(orders: CancelledOrderInput[]): StoreCancellationRow[] {
  const byStore = new Map<string, StoreCancellationRow>();
  for (const o of orders) {
    const existing = byStore.get(o.store_id);
    if (existing) {
      existing.count += 1;
      existing.lostAmount += o.gross_amount;
    } else {
      byStore.set(o.store_id, { storeId: o.store_id, count: 1, lostAmount: o.gross_amount });
    }
  }
  return Array.from(byStore.values()).sort((a, b) => b.lostAmount - a.lostAmount);
}

export interface ReasonRow {
  reason: string;
  count: number;
}

export function cancellationsByReason(orders: CancelledOrderInput[]): ReasonRow[] {
  const byReason = new Map<string, number>();
  for (const o of orders) {
    const reason = o.reason?.trim() || MISSING_REASON;
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  return Array.from(byReason.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/** Conta cancelamentos por hora do dia (0-23) — o timestamp já deve vir no fuso America/Sao_Paulo. */
export function cancellationsByHour(orders: { hour: number }[]): { hour: number; count: number }[] {
  const byHour = new Map<number, number>();
  for (const o of orders) {
    byHour.set(o.hour, (byHour.get(o.hour) ?? 0) + 1);
  }
  return Array.from(byHour.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count);
}

export function totalLostAmount(orders: CancelledOrderInput[]): number {
  return orders.reduce((sum, o) => sum + o.gross_amount, 0);
}
