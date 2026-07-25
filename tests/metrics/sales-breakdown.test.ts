import { describe, expect, it } from "vitest";
import { revenueByChannel, revenueByPaymentMethod } from "@/lib/metrics/sales-breakdown";

describe("revenueByChannel", () => {
  it("agrupa por canal e calcula participação excluindo cancelados", () => {
    const rows = revenueByChannel([
      { source_platform: "ifood", gross_amount: 100, status: "concluido" },
      { source_platform: "ifood", gross_amount: 50, status: "concluido" },
      { source_platform: "anota_ai", gross_amount: 50, status: "concluido" },
      { source_platform: "anota_ai", gross_amount: 1000, status: "cancelado" },
    ]);
    expect(rows).toEqual([
      { channel: "ifood", revenue: 150, orders: 2, share: 0.75 },
      { channel: "anota_ai", revenue: 50, orders: 1, share: 0.25 },
    ]);
  });

  it("retorna share 0 sem lançar quando não há faturamento", () => {
    const rows = revenueByChannel([{ source_platform: "ifood", gross_amount: 0, status: "cancelado" }]);
    expect(rows).toEqual([]);
  });
});

describe("revenueByPaymentMethod", () => {
  it("agrupa pedidos sem forma de pagamento sob null", () => {
    const rows = revenueByPaymentMethod([
      { payment_method: "card", gross_amount: 100, status: "concluido" },
      { payment_method: null, gross_amount: 50, status: "concluido" },
    ]);
    expect(rows.find((r) => r.paymentMethod === null)?.revenue).toBe(50);
    expect(rows.find((r) => r.paymentMethod === "card")?.revenue).toBe(100);
  });
});
