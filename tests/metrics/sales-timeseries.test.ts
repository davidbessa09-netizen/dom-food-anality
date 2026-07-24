import { describe, expect, it } from "vitest";
import { salesByDay, salesByHour, salesByWeekday, type SalesOrderInput } from "@/lib/metrics/sales-timeseries";

// 2026-07-01T12:00:00Z = 2026-07-01 09:00 em America/Sao_Paulo (UTC-3), quarta-feira
const orders: SalesOrderInput[] = [
  { gross_amount: 100, status: "concluido", ordered_at: "2026-07-01T12:00:00Z" },
  { gross_amount: 50, status: "concluido", ordered_at: "2026-07-01T14:00:00Z" },
  { gross_amount: 30, status: "cancelado", ordered_at: "2026-07-01T12:30:00Z" },
  { gross_amount: 80, status: "em_preparo", ordered_at: "2026-07-02T12:00:00Z" },
];

describe("salesByDay", () => {
  it("agrupa por data local, ignorando cancelados", () => {
    const rows = salesByDay(orders);
    const day1 = rows.find((r) => r.date === "2026-07-01")!;
    expect(day1.revenue).toBe(150);
    expect(day1.orders).toBe(2);
  });

  it("mantém dias diferentes separados", () => {
    const rows = salesByDay(orders);
    expect(rows).toHaveLength(2);
  });
});

describe("salesByHour", () => {
  it("sempre retorna 24 horas, mesmo sem vendas", () => {
    const rows = salesByHour(orders);
    expect(rows).toHaveLength(24);
  });

  it("agrupa corretamente no fuso America/Sao_Paulo", () => {
    const rows = salesByHour(orders);
    // 12:00 UTC = 09:00 em SP
    const hour9 = rows.find((r) => r.hour === 9)!;
    expect(hour9.revenue).toBe(100 + 80);
  });
});

describe("salesByWeekday", () => {
  it("sempre retorna 7 dias da semana", () => {
    const rows = salesByWeekday(orders);
    expect(rows).toHaveLength(7);
  });

  it("ignora pedidos cancelados no total", () => {
    const rows = salesByWeekday(orders);
    const total = rows.reduce((sum, r) => sum + r.orders, 0);
    expect(total).toBe(3);
  });
});
