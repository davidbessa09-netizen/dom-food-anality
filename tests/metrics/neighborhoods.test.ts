import { describe, expect, it } from "vitest";
import { ordersByNeighborhood, type DeliveryOrderInput } from "@/lib/metrics/neighborhoods";

const orders: DeliveryOrderInput[] = [
  { neighborhood_raw: "Centro", gross_amount: 50, status: "concluido" },
  { neighborhood_raw: "Centro", gross_amount: 30, status: "concluido" },
  { neighborhood_raw: "Kobrasol", gross_amount: 100, status: "concluido" },
  { neighborhood_raw: null, gross_amount: 20, status: "concluido" },
  { neighborhood_raw: "Centro", gross_amount: 999, status: "cancelado" },
];

describe("ordersByNeighborhood", () => {
  it("agrupa e soma pedidos por bairro", () => {
    const rows = ordersByNeighborhood(orders);
    const centro = rows.find((r) => r.neighborhood === "Centro")!;
    expect(centro.orders).toBe(2);
    expect(centro.revenue).toBe(80);
  });

  it("ignora pedidos cancelados", () => {
    const rows = ordersByNeighborhood(orders);
    const centro = rows.find((r) => r.neighborhood === "Centro")!;
    expect(centro.revenue).not.toBe(1079);
  });

  it('agrupa bairro ausente como "Bairro não informado"', () => {
    const rows = ordersByNeighborhood(orders);
    expect(rows.find((r) => r.neighborhood === "Bairro não informado")?.orders).toBe(1);
  });

  it("ordena por faturamento decrescente", () => {
    const rows = ordersByNeighborhood(orders);
    expect(rows[0].neighborhood).toBe("Kobrasol");
  });
});
