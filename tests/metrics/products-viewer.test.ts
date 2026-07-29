import { describe, expect, it } from "vitest";
import { buildViewerProductSummaries } from "@/lib/metrics/products-viewer";
import type { SaleItemEvent } from "@/lib/metrics/live-sales";

function makeEvent(overrides: Partial<SaleItemEvent>): SaleItemEvent {
  return {
    orderId: "order-1",
    orderedAt: "2026-07-27T15:00:00Z",
    status: "concluido",
    storeId: "store-1",
    storeName: "Gulas",
    channel: "Anota AI",
    paymentMethod: null,
    fulfillment: "entrega",
    productName: "Combo Mix",
    quantity: 1,
    totalPrice: 89.9,
    isAddon: false,
    ...overrides,
  };
}

describe("buildViewerProductSummaries", () => {
  it("agrupa pelo nome original e soma a quantidade real", () => {
    const events = [
      makeEvent({ orderId: "o1", quantity: 2 }),
      makeEvent({ orderId: "o2", quantity: 3 }),
    ];
    const summaries = buildViewerProductSummaries(events);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].quantity).toBe(5);
  });

  it("exclui pedidos cancelados da contagem", () => {
    const events = [
      makeEvent({ orderId: "o1", quantity: 10, status: "cancelado" }),
      makeEvent({ orderId: "o2", quantity: 2, status: "concluido" }),
    ];
    const summaries = buildViewerProductSummaries(events);
    expect(summaries[0].quantity).toBe(2);
  });

  it("divide a quantidade por dia real da venda (fuso America/Sao_Paulo), não por sincronização", () => {
    const events = [
      // 2026-07-27T02:00:00Z = 2026-07-26 23:00 em America/Sao_Paulo (ainda dia 26).
      makeEvent({ orderId: "o1", quantity: 4, orderedAt: "2026-07-27T02:00:00Z" }),
      makeEvent({ orderId: "o2", quantity: 6, orderedAt: "2026-07-27T15:00:00Z" }),
    ];
    const summaries = buildViewerProductSummaries(events);
    const byDay = summaries[0].byDay;
    expect(byDay.find((d) => d.date === "2026-07-26")?.quantity).toBe(4);
    expect(byDay.find((d) => d.date === "2026-07-27")?.quantity).toBe(6);
  });

  it("ordena produtos do mais vendido pro menos vendido", () => {
    const events = [
      makeEvent({ orderId: "o1", productName: "Molho Tarê", quantity: 5 }),
      makeEvent({ orderId: "o2", productName: "Combo Mix", quantity: 20 }),
    ];
    const summaries = buildViewerProductSummaries(events);
    expect(summaries.map((s) => s.productName)).toEqual(["Combo Mix", "Molho Tarê"]);
  });

  it("ordena a divisão por dia do mais recente pro mais antigo", () => {
    const events = [
      makeEvent({ orderId: "o1", quantity: 1, orderedAt: "2026-07-25T15:00:00Z" }),
      makeEvent({ orderId: "o2", quantity: 1, orderedAt: "2026-07-27T15:00:00Z" }),
      makeEvent({ orderId: "o3", quantity: 1, orderedAt: "2026-07-26T15:00:00Z" }),
    ];
    const summaries = buildViewerProductSummaries(events);
    expect(summaries[0].byDay.map((d) => d.date)).toEqual(["2026-07-27", "2026-07-26", "2026-07-25"]);
  });
});
