import { describe, expect, it } from "vitest";
import {
  buildRevenueDropOpportunity,
  buildStaleProductsOpportunity,
  buildDuplicateCategoriesOpportunity,
  buildDuplicateProductsOpportunity,
  buildCustomersAtRiskOpportunity,
  buildCancellationRateOpportunity,
} from "@/lib/intelligence/opportunity-rules";

describe("buildRevenueDropOpportunity", () => {
  it("retorna null quando não há queda significativa", () => {
    expect(buildRevenueDropOpportunity({ brandId: "b1", brandName: "Gulas", current: 100, previous: 100 })).toBeNull();
  });

  it("retorna null quando não há período anterior (previous <= 0)", () => {
    expect(buildRevenueDropOpportunity({ brandId: "b1", brandName: "Gulas", current: 100, previous: 0 })).toBeNull();
  });

  it("gera oportunidade crítica pra queda >= 30%", () => {
    const opp = buildRevenueDropOpportunity({ brandId: "b1", brandName: "Gulas", current: 60, previous: 100 });
    expect(opp?.priority).toBe("critica");
    expect(opp?.originType).toBe("regra_deterministica");
    expect(opp?.ruleKey).toBe("queda_faturamento");
  });

  it("gera oportunidade média pra queda entre 10% e 15%", () => {
    const opp = buildRevenueDropOpportunity({ brandId: "b1", brandName: "Gulas", current: 88, previous: 100 });
    expect(opp?.priority).toBe("media");
  });
});

describe("buildStaleProductsOpportunity", () => {
  it("retorna null quando não há produtos parados", () => {
    expect(
      buildStaleProductsOpportunity({
        brandId: "b1",
        brandName: "Gulas",
        staleCount: 0,
        neverSoldCount: 0,
        totalCatalogCount: 100,
        avgCatalogPrice: null,
        staleDaysThreshold: 30,
      })
    ).toBeNull();
  });

  it("inclui preço médio na evidência só quando disponível", () => {
    const withPrice = buildStaleProductsOpportunity({
      brandId: "b1",
      brandName: "Gulas",
      staleCount: 10,
      neverSoldCount: 5,
      totalCatalogCount: 50,
      avgCatalogPrice: 25.5,
      staleDaysThreshold: 30,
    });
    expect(withPrice?.evidence.some((e) => e.label.includes("Preço médio"))).toBe(true);

    const withoutPrice = buildStaleProductsOpportunity({
      brandId: "b1",
      brandName: "Gulas",
      staleCount: 10,
      neverSoldCount: 5,
      totalCatalogCount: 50,
      avgCatalogPrice: null,
      staleDaysThreshold: 30,
    });
    expect(withoutPrice?.evidence.some((e) => e.label.includes("Preço médio"))).toBe(false);
  });

  it("nunca menciona estoque na evidência (dado que o sistema não coleta)", () => {
    const opp = buildStaleProductsOpportunity({
      brandId: "b1",
      brandName: "Gulas",
      staleCount: 617,
      neverSoldCount: 0,
      totalCatalogCount: 3352,
      avgCatalogPrice: 30,
      staleDaysThreshold: 90,
    });
    expect(opp?.evidence.some((e) => e.label.toLowerCase().includes("estoque"))).toBe(false);
  });
});

describe("buildDuplicateCategoriesOpportunity", () => {
  it("retorna null sem grupos duplicados", () => {
    expect(buildDuplicateCategoriesOpportunity({ brandId: "b1", brandName: "Gulas", exactGroupCount: 0, totalDuplicateCategoryCount: 0 })).toBeNull();
  });

  it("gera oportunidade com score proporcional aos grupos", () => {
    const opp = buildDuplicateCategoriesOpportunity({ brandId: "b1", brandName: "Gulas", exactGroupCount: 3, totalDuplicateCategoryCount: 12 });
    expect(opp?.score).toBe(60);
    expect(opp?.category).toBe("qualidade_dados");
  });
});

describe("buildDuplicateProductsOpportunity", () => {
  it("retorna null sem grupos duplicados", () => {
    expect(buildDuplicateProductsOpportunity({ brandId: "b1", brandName: "Gulas", duplicateGroupCount: 0, duplicateProductCount: 0 })).toBeNull();
  });
});

describe("buildCustomersAtRiskOpportunity", () => {
  it("retorna null abaixo da amostra mínima", () => {
    expect(
      buildCustomersAtRiskOpportunity({ brandId: "b1", brandName: "Gulas", atRiskCount: 3, totalCustomers: 5, minSample: 10 })
    ).toBeNull();
  });

  it("gera oportunidade com origem 'modelo_estatistico'", () => {
    const opp = buildCustomersAtRiskOpportunity({ brandId: "b1", brandName: "Gulas", atRiskCount: 20, totalCustomers: 50, minSample: 10 });
    expect(opp?.originType).toBe("modelo_estatistico");
  });
});

describe("buildCancellationRateOpportunity", () => {
  it("retorna null abaixo de 10% de cancelamento", () => {
    expect(
      buildCancellationRateOpportunity({ brandId: "b1", brandName: "Gulas", cancellationRate: 0.05, cancelledCount: 5, totalOrders: 100, topReason: null })
    ).toBeNull();
  });

  it("gera prioridade crítica a partir de 20%", () => {
    const opp = buildCancellationRateOpportunity({
      brandId: "b1",
      brandName: "Gulas",
      cancellationRate: 0.25,
      cancelledCount: 25,
      totalOrders: 100,
      topReason: "Cliente desistiu",
    });
    expect(opp?.priority).toBe("critica");
    expect(opp?.evidence.some((e) => e.value === "Cliente desistiu")).toBe(true);
  });
});
