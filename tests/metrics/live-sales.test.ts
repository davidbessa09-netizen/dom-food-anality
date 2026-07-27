import { describe, expect, it } from "vitest";
import {
  filterByStatusMode,
  buildProductSalesSummaries,
  buildOverallIndicators,
  buildGrowthComparison,
  groupEventsByOrder,
  type SaleItemEvent,
} from "@/lib/metrics/live-sales";

function makeEvent(overrides: Partial<SaleItemEvent>): SaleItemEvent {
  return {
    orderId: "order-1",
    orderedAt: "2026-07-25T10:00:00Z",
    status: "concluido",
    storeId: "store-1",
    storeName: "Gulas",
    channel: "Anota AI",
    paymentMethod: "card",
    fulfillment: "entrega",
    productName: "Combo Mix",
    quantity: 1,
    totalPrice: 89.9,
    isAddon: false,
    ...overrides,
  };
}

describe("filterByStatusMode", () => {
  it("separa confirmadas, em andamento e canceladas corretamente", () => {
    const events = [
      makeEvent({ status: "concluido" }),
      makeEvent({ status: "em_preparo" }),
      makeEvent({ status: "cancelado" }),
    ];
    expect(filterByStatusMode(events, "confirmadas")).toHaveLength(1);
    expect(filterByStatusMode(events, "em_andamento")).toHaveLength(1);
    expect(filterByStatusMode(events, "canceladas")).toHaveLength(1);
  });

  it("exclui adicionais por padrão", () => {
    const events = [makeEvent({ isAddon: true })];
    expect(filterByStatusMode(events, "confirmadas")).toHaveLength(0);
    expect(filterByStatusMode(events, "confirmadas", true)).toHaveLength(1);
  });
});

describe("buildProductSalesSummaries", () => {
  it("soma quantidade real e conta pedidos distintos (não confunde os dois)", () => {
    const events = [
      makeEvent({ orderId: "o1", quantity: 2, totalPrice: 179.8 }),
      makeEvent({ orderId: "o2", quantity: 1, totalPrice: 89.9 }),
      makeEvent({ orderId: "o3", quantity: 3, totalPrice: 269.7 }),
    ];
    const summaries = buildProductSalesSummaries(events);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].quantity).toBe(6);
    expect(summaries[0].orders).toBe(3);
    expect(summaries[0].revenue).toBeCloseTo(539.4, 5);
  });

  it("conta pedidos distintos mesmo com o mesmo pedido tendo múltiplos itens do produto", () => {
    const events = [
      makeEvent({ orderId: "o1", quantity: 2 }),
      makeEvent({ orderId: "o1", quantity: 1 }), // mesmo pedido, segunda linha do mesmo produto
    ];
    const summaries = buildProductSalesSummaries(events);
    expect(summaries[0].quantity).toBe(3);
    expect(summaries[0].orders).toBe(1);
  });

  it("identifica a loja e o canal com mais faturamento pro produto", () => {
    const events = [
      makeEvent({ orderId: "o1", storeName: "Gulas", channel: "Anota AI", totalPrice: 50 }),
      makeEvent({ orderId: "o2", storeName: "Nikô Palhoça", channel: "iFood", totalPrice: 200 }),
    ];
    const summaries = buildProductSalesSummaries(events);
    expect(summaries[0].topStoreName).toBe("Nikô Palhoça");
    expect(summaries[0].topChannel).toBe("iFood");
  });
});

describe("buildOverallIndicators", () => {
  it("nunca confunde unidades vendidas, pedidos concluídos e faturamento", () => {
    const confirmed = [
      makeEvent({ orderId: "o1", productName: "Combo Mix", quantity: 2, totalPrice: 179.8 }),
      makeEvent({ orderId: "o2", productName: "Temaki", quantity: 1, totalPrice: 30 }),
    ];
    const cancelled = [makeEvent({ orderId: "o3", status: "cancelado", quantity: 5 })];
    const indicators = buildOverallIndicators(confirmed, cancelled);
    expect(indicators.unitsSold).toBe(3);
    expect(indicators.completedOrders).toBe(2);
    expect(indicators.revenue).toBeCloseTo(209.8, 5);
    expect(indicators.distinctProducts).toBe(2);
    expect(indicators.cancelledUnits).toBe(5);
    expect(indicators.topSellingProductByQuantity).toBe("Combo Mix");
  });
});

describe("groupEventsByOrder", () => {
  it("agrupa múltiplos itens do mesmo pedido em um só grupo", () => {
    const events = [
      makeEvent({ orderId: "o1", productName: "Combo Mix", quantity: 1, totalPrice: 89.9, orderedAt: "2026-07-25T22:43:00Z" }),
      makeEvent({ orderId: "o1", productName: "Pureza 1 Lt", quantity: 1, totalPrice: 10, orderedAt: "2026-07-25T22:43:05Z" }),
      makeEvent({ orderId: "o1", productName: "Tarê", quantity: 1, totalPrice: 2, orderedAt: "2026-07-25T22:43:10Z" }),
      makeEvent({ orderId: "o2", productName: "Temaki", quantity: 2, totalPrice: 60, orderedAt: "2026-07-25T22:00:00Z" }),
    ];
    const groups = groupEventsByOrder(events);
    expect(groups).toHaveLength(2);
    const first = groups.find((g) => g.orderId === "o1")!;
    expect(first.itemCount).toBe(3);
    expect(first.totalQuantity).toBe(3);
    expect(first.totalValue).toBeCloseTo(101.9, 5);
    expect(first.firstProductName).toBe("Combo Mix");
  });

  it("ordena grupos do mais recente pro mais antigo", () => {
    const events = [
      makeEvent({ orderId: "o1", orderedAt: "2026-07-25T10:00:00Z" }),
      makeEvent({ orderId: "o2", orderedAt: "2026-07-25T12:00:00Z" }),
    ];
    const groups = groupEventsByOrder(events);
    expect(groups.map((g) => g.orderId)).toEqual(["o2", "o1"]);
  });
});

describe("buildGrowthComparison", () => {
  it("só compara produtos que já venderam no período anterior (exclui recém-cadastrados)", () => {
    const current = buildProductSalesSummaries([
      makeEvent({ orderId: "o1", productName: "Combo Mix", quantity: 10 }),
      makeEvent({ orderId: "o2", productName: "Produto Novo", quantity: 5 }),
    ]);
    const previous = buildProductSalesSummaries([makeEvent({ orderId: "o0", productName: "Combo Mix", quantity: 5 })]);

    const { growing, declining } = buildGrowthComparison(current, previous);
    expect(growing.map((r) => r.productName)).toEqual(["Combo Mix"]);
    expect(declining).toEqual([]);
  });

  it("classifica queda quando a quantidade atual é menor que a anterior", () => {
    const current = buildProductSalesSummaries([makeEvent({ productName: "X", quantity: 2 })]);
    const previous = buildProductSalesSummaries([makeEvent({ productName: "X", quantity: 10 })]);
    const { declining } = buildGrowthComparison(current, previous);
    expect(declining).toHaveLength(1);
    expect(declining[0].growth).toBeLessThan(0);
  });
});
