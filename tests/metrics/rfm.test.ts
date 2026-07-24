import { describe, expect, it } from "vitest";
import { buildRfmSegmentation, computeCustomerStats, type CustomerOrderInput } from "@/lib/metrics/rfm";

const now = "2026-07-23T00:00:00Z";

// Base maior (8 clientes) para os percentis terem separação significativa —
// RFM por quintil não funciona bem com amostras minúsculas (ver METRICS.md).
const orders: CustomerOrderInput[] = [
  // A: muitos pedidos, valor alto, recente -> fiel/alto valor
  { customer_id: "A", gross_amount: 100, ordered_at: "2026-07-01T00:00:00Z" },
  { customer_id: "A", gross_amount: 100, ordered_at: "2026-07-10T00:00:00Z" },
  { customer_id: "A", gross_amount: 100, ordered_at: "2026-07-15T00:00:00Z" },
  { customer_id: "A", gross_amount: 100, ordered_at: "2026-07-20T00:00:00Z" },
  { customer_id: "A", gross_amount: 100, ordered_at: "2026-07-22T00:00:00Z" },
  // B: só 1 pedido, hoje -> novo
  { customer_id: "B", gross_amount: 30, ordered_at: "2026-07-23T00:00:00Z" },
  // C: 1 pedido há muito tempo -> perdido/inativo
  { customer_id: "C", gross_amount: 20, ordered_at: "2025-10-01T00:00:00Z" },
  // D-H: clientes "médios" pra dar volume e distribuir os percentis
  { customer_id: "D", gross_amount: 40, ordered_at: "2026-06-01T00:00:00Z" },
  { customer_id: "D", gross_amount: 40, ordered_at: "2026-06-15T00:00:00Z" },
  { customer_id: "E", gross_amount: 35, ordered_at: "2026-05-01T00:00:00Z" },
  { customer_id: "F", gross_amount: 60, ordered_at: "2026-04-01T00:00:00Z" },
  { customer_id: "G", gross_amount: 25, ordered_at: "2026-03-01T00:00:00Z" },
  { customer_id: "H", gross_amount: 45, ordered_at: "2026-02-01T00:00:00Z" },
];

describe("computeCustomerStats", () => {
  it("calcula frequência e valor monetário corretamente", () => {
    const stats = computeCustomerStats(orders, now);
    const a = stats.find((s) => s.customerId === "A")!;
    expect(a.frequency).toBe(5);
    expect(a.monetary).toBe(500);
  });

  it("calcula recência em dias a partir de 'now'", () => {
    const stats = computeCustomerStats(orders, now);
    const c = stats.find((s) => s.customerId === "C")!;
    expect(c.recencyDays).toBeGreaterThan(150);
  });

  it("mantém a primeira e a última data de compra", () => {
    const stats = computeCustomerStats(orders, now);
    const a = stats.find((s) => s.customerId === "A")!;
    expect(a.firstOrderAt).toBe("2026-07-01T00:00:00Z");
    expect(a.lastOrderAt).toBe("2026-07-22T00:00:00Z");
  });
});

describe("buildRfmSegmentation", () => {
  it("classifica cliente com 1 pedido no dia de hoje como Novos", () => {
    const stats = computeCustomerStats(orders, now);
    const rows = buildRfmSegmentation(stats);
    const b = rows.find((r) => r.customerId === "B")!;
    expect(b.segment).toBe("Novos");
  });

  it("classifica cliente com pedido antigo e baixa frequência como Perdidos ou Inativos", () => {
    const stats = computeCustomerStats(orders, now);
    const rows = buildRfmSegmentation(stats);
    const c = rows.find((r) => r.customerId === "C")!;
    expect(["Perdidos", "Inativos"]).toContain(c.segment);
  });

  it("classifica cliente frequente e recente como fiel ou de alto valor", () => {
    const stats = computeCustomerStats(orders, now);
    const rows = buildRfmSegmentation(stats);
    const a = rows.find((r) => r.customerId === "A")!;
    expect(["Clientes fiéis", "Clientes de alto valor"]).toContain(a.segment);
  });

  it("quando todos os clientes têm a mesma recência (ex.: todos compraram hoje), não classifica todos como Inativos", () => {
    const sameDay: CustomerOrderInput[] = [
      { customer_id: "X", gross_amount: 50, ordered_at: now },
      { customer_id: "Y", gross_amount: 60, ordered_at: now },
      { customer_id: "Z", gross_amount: 70, ordered_at: now },
    ];
    const stats = computeCustomerStats(sameDay, now);
    const rows = buildRfmSegmentation(stats);
    for (const row of rows) {
      expect(row.recencyScore).toBe(5);
      expect(row.segment).not.toBe("Inativos");
      expect(row.segment).not.toBe("Perdidos");
    }
  });

  it("todo score fica entre 1 e 5", () => {
    const stats = computeCustomerStats(orders, now);
    const rows = buildRfmSegmentation(stats);
    for (const row of rows) {
      expect(row.recencyScore).toBeGreaterThanOrEqual(1);
      expect(row.recencyScore).toBeLessThanOrEqual(5);
      expect(row.frequencyScore).toBeGreaterThanOrEqual(1);
      expect(row.monetaryScore).toBeLessThanOrEqual(5);
    }
  });
});
