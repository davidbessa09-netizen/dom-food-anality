import { describe, expect, it } from "vitest";
import { buildStatusDistribution, ORDER_STATUS_SEQUENCE, type OrderStatus } from "@/lib/metrics/funnel";

describe("buildStatusDistribution", () => {
  const statuses: OrderStatus[] = ["criado", "confirmado", "concluido", "concluido", "cancelado"];

  it("conta pedidos por status", () => {
    const rows = buildStatusDistribution(statuses);
    expect(rows.find((r) => r.status === "concluido")?.count).toBe(2);
    expect(rows.find((r) => r.status === "cancelado")?.count).toBe(1);
    expect(rows.find((r) => r.status === "em_preparo")?.count).toBe(0);
  });

  it("inclui todas as etapas da sequência, mesmo com contagem zero", () => {
    const rows = buildStatusDistribution([]);
    expect(rows).toHaveLength(ORDER_STATUS_SEQUENCE.length + 1);
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });
});
