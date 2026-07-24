import { describe, expect, it } from "vitest";
import {
  averageTicket,
  cancellationRate,
  cancelledOrdersCount,
  completedOrdersCount,
  discountsTotal,
  deliveryFeesTotal,
  grossRevenue,
  growthRate,
  itemsPerOrder,
  netRevenue,
  newCustomersCount,
  repurchaseRate,
  returningCustomersCount,
  totalOrders,
  uniqueCustomers,
  type OrderMetricInput,
} from "@/lib/metrics/orders";

const orders: OrderMetricInput[] = [
  { id: "1", status: "concluido", gross_amount: 100, net_amount: 90, discount_amount: 10, delivery_fee_amount: 5, customer_id: "c1" },
  { id: "2", status: "concluido", gross_amount: 200, net_amount: 180, discount_amount: 0, delivery_fee_amount: 8, customer_id: "c2" },
  { id: "3", status: "cancelado", gross_amount: 50, net_amount: null, discount_amount: 0, delivery_fee_amount: 0, customer_id: "c1" },
  { id: "4", status: "criado", gross_amount: 30, net_amount: null, discount_amount: 0, delivery_fee_amount: 0, customer_id: null },
];

describe("grossRevenue", () => {
  it("soma pedidos não cancelados", () => {
    expect(grossRevenue(orders)).toBe(100 + 200 + 30);
  });
});

describe("netRevenue", () => {
  it("soma apenas onde net_amount está disponível", () => {
    expect(netRevenue(orders)).toBe(90 + 180);
  });

  it("retorna null quando nenhum pedido tem net_amount", () => {
    const noNet = orders.map((o) => ({ ...o, net_amount: null }));
    expect(netRevenue(noNet)).toBeNull();
  });
});

describe("contagens básicas", () => {
  it("totalOrders", () => expect(totalOrders(orders)).toBe(4));
  it("completedOrdersCount", () => expect(completedOrdersCount(orders)).toBe(2));
  it("cancelledOrdersCount", () => expect(cancelledOrdersCount(orders)).toBe(1));
});

describe("cancellationRate", () => {
  it("calcula proporção de cancelados", () => {
    expect(cancellationRate(orders)).toBeCloseTo(1 / 4);
  });

  it("retorna null para lista vazia", () => {
    expect(cancellationRate([])).toBeNull();
  });
});

describe("averageTicket", () => {
  it("usa apenas pedidos concluídos", () => {
    expect(averageTicket(orders)).toBe((100 + 200) / 2);
  });

  it("retorna null se não há concluídos", () => {
    expect(averageTicket(orders.filter((o) => o.status !== "concluido"))).toBeNull();
  });
});

describe("itemsPerOrder", () => {
  it("considera apenas itens de pedidos concluídos", () => {
    const items = [
      { order_id: "1", quantity: 2 },
      { order_id: "2", quantity: 3 },
      { order_id: "3", quantity: 10 }, // cancelado, não deve contar
    ];
    expect(itemsPerOrder(orders, items)).toBe((2 + 3) / 2);
  });
});

describe("descontos e taxas", () => {
  it("discountsTotal soma todos os pedidos", () => expect(discountsTotal(orders)).toBe(10));
  it("deliveryFeesTotal soma todos os pedidos", () => expect(deliveryFeesTotal(orders)).toBe(13));
});

describe("clientes", () => {
  it("uniqueCustomers ignora nulos", () => {
    expect(uniqueCustomers(orders)).toBe(2);
  });

  it("newCustomersCount conta quem comprou pela primeira vez no período", () => {
    const firstOrderDate = new Map([
      ["c1", "2026-01-05"],
      ["c2", "2025-12-01"],
    ]);
    expect(newCustomersCount(orders, firstOrderDate, "2026-01-01", "2026-01-31")).toBe(1);
  });

  it("returningCustomersCount é o complemento de newCustomers", () => {
    const firstOrderDate = new Map([
      ["c1", "2026-01-05"],
      ["c2", "2025-12-01"],
    ]);
    expect(returningCustomersCount(orders, firstOrderDate, "2026-01-01", "2026-01-31")).toBe(1);
  });

  it("repurchaseRate retorna null sem clientes", () => {
    expect(repurchaseRate([], new Map(), "2026-01-01", "2026-01-31")).toBeNull();
  });
});

describe("growthRate", () => {
  it("calcula variação percentual", () => {
    expect(growthRate(150, 100)).toBeCloseTo(0.5);
  });

  it("retorna null quando período anterior é zero", () => {
    expect(growthRate(150, 0)).toBeNull();
  });
});
