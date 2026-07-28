import { describe, expect, it } from "vitest";
import { salesByDay, salesByHour, salesByWeekday, groupDailyByWeek, groupDailyByMonth, type SalesOrderInput } from "@/lib/metrics/sales-timeseries";

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

describe("groupDailyByWeek", () => {
  it("agrupa dias da mesma semana ISO (segunda a domingo) num só ponto", () => {
    // 2026-07-01 é quarta, 2026-07-02 é quinta — mesma semana.
    const daily = salesByDay(orders);
    const weekly = groupDailyByWeek(daily);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].revenue).toBe(230);
    expect(weekly[0].orders).toBe(3);
  });

  it("separa semanas diferentes", () => {
    const daily = [
      { date: "2026-07-01", revenue: 100, orders: 1 },
      { date: "2026-07-13", revenue: 200, orders: 2 }, // semana seguinte
    ];
    expect(groupDailyByWeek(daily)).toHaveLength(2);
  });
});

describe("groupDailyByMonth", () => {
  it("agrupa dias do mesmo mês", () => {
    const daily = [
      { date: "2026-07-01", revenue: 100, orders: 1 },
      { date: "2026-07-28", revenue: 50, orders: 1 },
      { date: "2026-08-01", revenue: 20, orders: 1 },
    ];
    const monthly = groupDailyByMonth(daily);
    expect(monthly).toHaveLength(2);
    expect(monthly.find((m) => m.date === "2026-07-01")?.revenue).toBe(150);
    expect(monthly.find((m) => m.date === "2026-08-01")?.revenue).toBe(20);
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
