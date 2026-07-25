import { describe, expect, it } from "vitest";
import {
  averageItemsPerOrder,
  buildProductRanking,
  daysSinceLastSale,
  findProductsWithoutSales,
  rankByQuantity,
  rankByRevenue,
  type ProductOrderItemInput,
} from "@/lib/metrics/products";

const items: ProductOrderItemInput[] = [
  { original_name: "Combo Chef", quantity: 2, total_price: 100, order_status: "concluido", ordered_at: "2026-07-01T10:00:00Z" },
  { original_name: "Combo Chef", quantity: 1, total_price: 50, order_status: "concluido", ordered_at: "2026-07-05T10:00:00Z" },
  { original_name: "Temaki Salmão", quantity: 5, total_price: 90, order_status: "concluido", ordered_at: "2026-07-03T10:00:00Z" },
  { original_name: "Refrigerante", quantity: 5, total_price: 25, order_status: "cancelado", ordered_at: "2026-07-04T10:00:00Z" },
  { original_name: "Molho extra", quantity: 1, total_price: 3, order_status: "concluido", is_addon: true, ordered_at: "2026-07-04T10:00:00Z" },
];

describe("buildProductRanking", () => {
  it("agrupa e soma apenas itens de pedidos concluídos, ignorando adicionais", () => {
    const rows = buildProductRanking(items);
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(["Combo Chef", "Temaki Salmão"]);
  });

  it("soma quantidade e faturamento corretamente entre pedidos", () => {
    const rows = buildProductRanking(items);
    const comboChef = rows.find((r) => r.name === "Combo Chef")!;
    expect(comboChef.quantity).toBe(3);
    expect(comboChef.revenue).toBe(150);
  });

  it("mantém a data da venda mais recente", () => {
    const rows = buildProductRanking(items);
    const comboChef = rows.find((r) => r.name === "Combo Chef")!;
    expect(comboChef.lastSoldAt).toBe("2026-07-05T10:00:00Z");
  });

  it("exclui itens de pedidos cancelados", () => {
    const rows = buildProductRanking(items);
    expect(rows.find((r) => r.name === "Refrigerante")).toBeUndefined();
  });
});

describe("rankByQuantity / rankByRevenue", () => {
  const rows = buildProductRanking(items);

  it("ordena por quantidade decrescente", () => {
    const ranked = rankByQuantity(rows);
    expect(ranked[0].name).toBe("Temaki Salmão");
  });

  it("ordena por faturamento decrescente", () => {
    const ranked = rankByRevenue(rows);
    expect(ranked[0].name).toBe("Combo Chef");
  });
});

describe("findProductsWithoutSales", () => {
  it("retorna produtos do catálogo que não venderam no período", () => {
    const rows = buildProductRanking(items);
    const withoutSales = findProductsWithoutSales(["Combo Chef", "Sushi Especial"], rows);
    expect(withoutSales).toEqual(["Sushi Especial"]);
  });
});

describe("daysSinceLastSale", () => {
  it("calcula a diferença em dias inteiros", () => {
    expect(daysSinceLastSale("2026-07-01T00:00:00Z", "2026-07-10T00:00:00Z")).toBe(9);
  });
});

describe("buildProductRanking com itemType", () => {
  it("'adicional' considera só itens marcados como adicional", () => {
    const rows = buildProductRanking(items, "adicional");
    expect(rows.map((r) => r.name)).toEqual(["Molho extra"]);
  });

  it("'all' inclui principais e adicionais juntos", () => {
    const rows = buildProductRanking(items, "all");
    expect(rows.map((r) => r.name).sort()).toEqual(["Combo Chef", "Molho extra", "Temaki Salmão"]);
  });
});

describe("averageItemsPerOrder", () => {
  it("calcula itens principais por pedido concluído", () => {
    const avg = averageItemsPerOrder([
      { status: "concluido", items: [{ quantity: 2 }, { quantity: 1, is_addon: true }] },
      { status: "concluido", items: [{ quantity: 4 }] },
      { status: "cancelado", items: [{ quantity: 10 }] },
    ]);
    expect(avg).toBe(3); // (2 + 4) / 2 pedidos concluídos com item principal
  });

  it("retorna null quando não há pedido concluído com item principal", () => {
    expect(averageItemsPerOrder([{ status: "concluido", items: [{ quantity: 1, is_addon: true }] }])).toBeNull();
    expect(averageItemsPerOrder([])).toBeNull();
  });
});
