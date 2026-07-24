import { describe, expect, it } from "vitest";
import {
  cancellationsByHour,
  cancellationsByReason,
  cancellationsByStore,
  totalLostAmount,
  type CancelledOrderInput,
} from "@/lib/metrics/cancellations";

const orders: CancelledOrderInput[] = [
  { id: "1", store_id: "store-a", gross_amount: 50, ordered_at: "2026-07-01T10:00:00Z", reason: "Cliente desistiu" },
  { id: "2", store_id: "store-a", gross_amount: 30, ordered_at: "2026-07-02T10:00:00Z", reason: null },
  { id: "3", store_id: "store-b", gross_amount: 20, ordered_at: "2026-07-03T10:00:00Z", reason: "Cliente desistiu" },
];

describe("cancellationsByStore", () => {
  it("agrupa contagem e valor perdido por loja, ordenado por valor perdido", () => {
    const rows = cancellationsByStore(orders);
    expect(rows[0].storeId).toBe("store-a");
    expect(rows[0].count).toBe(2);
    expect(rows[0].lostAmount).toBe(80);
    expect(rows[1].storeId).toBe("store-b");
  });
});

describe("cancellationsByReason", () => {
  it("usa 'Motivo não informado' quando reason é null", () => {
    const rows = cancellationsByReason(orders);
    const missing = rows.find((r) => r.reason === "Motivo não informado");
    expect(missing?.count).toBe(1);
  });

  it("agrupa motivos iguais", () => {
    const rows = cancellationsByReason(orders);
    const desistiu = rows.find((r) => r.reason === "Cliente desistiu");
    expect(desistiu?.count).toBe(2);
  });
});

describe("cancellationsByHour", () => {
  it("agrupa por hora do dia", () => {
    const rows = cancellationsByHour([{ hour: 10 }, { hour: 10 }, { hour: 14 }]);
    expect(rows[0]).toEqual({ hour: 10, count: 2 });
  });
});

describe("totalLostAmount", () => {
  it("soma o valor bruto de todos os pedidos cancelados", () => {
    expect(totalLostAmount(orders)).toBe(100);
  });
});
