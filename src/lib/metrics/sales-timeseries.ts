// Séries temporais de vendas para a tela de Vendas (ver METRICS.md).
// Segue a mesma regra de faturamento bruto usada no resto do sistema: soma
// gross_amount de pedidos não cancelados (não filtra por "concluído" aqui,
// pois pedidos em andamento ainda representam venda registrada no dia/hora).

import { APP_TIMEZONE } from "@/lib/dates/period";

export interface SalesOrderInput {
  gross_amount: number;
  status: string;
  ordered_at: string; // ISO
}

export interface DaySalesRow {
  date: string; // yyyy-MM-dd
  revenue: number;
  orders: number;
}

export interface HourSalesRow {
  hour: number; // 0-23
  revenue: number;
  orders: number;
}

export interface WeekdaySalesRow {
  weekday: number; // 0 (domingo) a 6 (sábado), padrão JS Date#getDay()
  revenue: number;
  orders: number;
}

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function partsInTz(isoDate: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(new Date(isoDate));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function isCancelled(status: string) {
  return status === "cancelado";
}

export function salesByDay(orders: SalesOrderInput[]): DaySalesRow[] {
  const byDate = new Map<string, DaySalesRow>();
  for (const o of orders) {
    if (isCancelled(o.status)) continue;
    const { date } = partsInTz(o.ordered_at);
    const existing = byDate.get(date);
    if (existing) {
      existing.revenue += o.gross_amount;
      existing.orders += 1;
    } else {
      byDate.set(date, { date, revenue: o.gross_amount, orders: 1 });
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Segunda-feira da semana ISO de uma data "yyyy-MM-dd" — pura aritmética de
 * calendário (sem envolver fuso do runtime, mesmo cuidado de
 * [[formatDayLabel]]). */
function isoWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

/** Re-agrupa uma série diária (já sem cancelados) por semana — usado pela
 * alternância diário/semanal/mensal do gráfico principal do dashboard. */
export function groupDailyByWeek(daily: DaySalesRow[]): DaySalesRow[] {
  const byWeek = new Map<string, DaySalesRow>();
  for (const row of daily) {
    const weekStart = isoWeekStart(row.date);
    const existing = byWeek.get(weekStart);
    if (existing) {
      existing.revenue += row.revenue;
      existing.orders += row.orders;
    } else {
      byWeek.set(weekStart, { date: weekStart, revenue: row.revenue, orders: row.orders });
    }
  }
  return Array.from(byWeek.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Re-agrupa uma série diária por mês (chave "yyyy-MM", data-base no dia 1). */
export function groupDailyByMonth(daily: DaySalesRow[]): DaySalesRow[] {
  const byMonth = new Map<string, DaySalesRow>();
  for (const row of daily) {
    const monthKey = row.date.slice(0, 7);
    const existing = byMonth.get(monthKey);
    if (existing) {
      existing.revenue += row.revenue;
      existing.orders += row.orders;
    } else {
      byMonth.set(monthKey, { date: `${monthKey}-01`, revenue: row.revenue, orders: row.orders });
    }
  }
  return Array.from(byMonth.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function salesByHour(orders: SalesOrderInput[]): HourSalesRow[] {
  const byHour = new Map<number, HourSalesRow>();
  for (const o of orders) {
    if (isCancelled(o.status)) continue;
    const { hour } = partsInTz(o.ordered_at);
    const existing = byHour.get(hour);
    if (existing) {
      existing.revenue += o.gross_amount;
      existing.orders += 1;
    } else {
      byHour.set(hour, { hour, revenue: o.gross_amount, orders: 1 });
    }
  }
  return Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? { hour, revenue: 0, orders: 0 });
}

export function salesByWeekday(orders: SalesOrderInput[]): WeekdaySalesRow[] {
  const byWeekday = new Map<number, WeekdaySalesRow>();
  for (const o of orders) {
    if (isCancelled(o.status)) continue;
    const { weekday } = partsInTz(o.ordered_at);
    const existing = byWeekday.get(weekday);
    if (existing) {
      existing.revenue += o.gross_amount;
      existing.orders += 1;
    } else {
      byWeekday.set(weekday, { weekday, revenue: o.gross_amount, orders: 1 });
    }
  }
  return Array.from({ length: 7 }, (_, weekday) => byWeekday.get(weekday) ?? { weekday, revenue: 0, orders: 0 });
}
