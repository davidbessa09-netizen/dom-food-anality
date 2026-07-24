import { describe, expect, it } from "vitest";
import { buildProductPairs, type ComboOrderItemInput } from "@/lib/metrics/combos";

const items: ComboOrderItemInput[] = [
  { order_id: "o1", original_name: "Temaki Salmão", order_status: "concluido" },
  { order_id: "o1", original_name: "Coca-Cola", order_status: "concluido" },
  { order_id: "o2", original_name: "Temaki Salmão", order_status: "concluido" },
  { order_id: "o2", original_name: "Coca-Cola", order_status: "concluido" },
  { order_id: "o3", original_name: "Temaki Salmão", order_status: "concluido" },
  { order_id: "o3", original_name: "Molho extra", order_status: "concluido", is_addon: true },
  { order_id: "o4", original_name: "Combo Chef", order_status: "cancelado" },
  { order_id: "o4", original_name: "Coca-Cola", order_status: "cancelado" },
  { order_id: "o5", original_name: "Temaki Salmão", order_status: "concluido" },
];

describe("buildProductPairs", () => {
  it("conta pares de produtos que aparecem juntos no mesmo pedido concluído", () => {
    const pairs = buildProductPairs(items);
    const pair = pairs.find((p) => p.productA === "Coca-Cola" && p.productB === "Temaki Salmão");
    expect(pair?.count).toBe(2);
  });

  it("ignora adicionais ao formar pares", () => {
    const pairs = buildProductPairs(items);
    expect(pairs.some((p) => p.productA === "Molho extra" || p.productB === "Molho extra")).toBe(false);
  });

  it("ignora pedidos cancelados", () => {
    const pairs = buildProductPairs(items);
    expect(pairs.some((p) => p.productA === "Combo Chef" || p.productB === "Combo Chef")).toBe(false);
  });

  it("não gera par para pedido com um único produto", () => {
    const pairs = buildProductPairs(items);
    const total = pairs.reduce((sum, p) => sum + p.count, 0);
    expect(total).toBe(2); // só o1 e o2 formam o par Coca-Cola + Temaki Salmão
  });

  it("ordena por contagem decrescente", () => {
    const pairs = buildProductPairs(items);
    expect(pairs[0].count).toBeGreaterThanOrEqual(pairs[pairs.length - 1]?.count ?? 0);
  });
});
