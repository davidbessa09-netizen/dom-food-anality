import { describe, expect, it } from "vitest";
import { parseFilters } from "@/lib/filters/parse";

describe("parseFilters", () => {
  it("usa 30d como período padrão quando nada é informado", () => {
    const result = parseFilters({});
    expect(result.periodPreset).toBe("30d");
    expect(result.storeIds).toEqual([]);
    expect(result.compare).toBe("none");
    expect(result.brandId).toBeNull();
  });

  it("separa a lista de lojas por vírgula", () => {
    const result = parseFilters({ stores: "loja-1,loja-2,loja-3" });
    expect(result.storeIds).toEqual(["loja-1", "loja-2", "loja-3"]);
  });

  it("ignora valor inválido de comparação, caindo em 'none'", () => {
    const result = parseFilters({ compare: "algo-invalido" });
    expect(result.compare).toBe("none");
  });

  it("aceita 'previous_year' como modo de comparação", () => {
    const result = parseFilters({ compare: "previous_year" });
    expect(result.compare).toBe("previous_year");
  });

  it("usa período customizado quando from/to são informados", () => {
    const result = parseFilters({ from: "2026-01-01", to: "2026-01-31" });
    expect(result.customFrom).toBe("2026-01-01");
    expect(result.customTo).toBe("2026-01-31");
  });

  it("repassa marca, canal, status e tipo de retirada", () => {
    const result = parseFilters({ brand: "b1", channel: "ifood", status: "concluido", fulfillment: "entrega" });
    expect(result.brandId).toBe("b1");
    expect(result.channel).toBe("ifood");
    expect(result.status).toBe("concluido");
    expect(result.fulfillment).toBe("entrega");
  });
});
