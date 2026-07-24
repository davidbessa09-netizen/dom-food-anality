import { describe, expect, it } from "vitest";
import { buildRecommendations, type RecommendationInput } from "@/lib/metrics/recommendations";

const base: RecommendationInput = {
  revenueCurrent: 1000,
  revenuePrevious: 1000,
  cancellationRate: 0,
  cancelledCount: 0,
  topCancelReason: null,
  stalledProductsCount: 0,
  atRiskCustomersCount: 0,
  totalCustomersCount: 0,
  minCustomerSample: 10,
};

describe("buildRecommendations", () => {
  it("não recomenda nada quando tudo está dentro do esperado", () => {
    expect(buildRecommendations(base)).toEqual([]);
  });

  it("recomenda revisão quando o faturamento caiu mais de 15%", () => {
    const recs = buildRecommendations({ ...base, revenueCurrent: 800, revenuePrevious: 1000 });
    expect(recs.find((r) => r.id === "queda-faturamento")?.severity).toBe("media");
  });

  it("marca severidade alta quando a queda de faturamento é maior que 30%", () => {
    const recs = buildRecommendations({ ...base, revenueCurrent: 600, revenuePrevious: 1000 });
    expect(recs.find((r) => r.id === "queda-faturamento")?.severity).toBe("alta");
  });

  it("ignora comparação de faturamento quando não há período anterior", () => {
    const recs = buildRecommendations({ ...base, revenueCurrent: 100, revenuePrevious: null });
    expect(recs.find((r) => r.id === "queda-faturamento")).toBeUndefined();
  });

  it("recomenda investigar cancelamento quando a taxa é >= 10%", () => {
    const recs = buildRecommendations({
      ...base,
      cancellationRate: 0.12,
      cancelledCount: 6,
      topCancelReason: { reason: "Cliente desistiu", count: 4 },
    });
    const rec = recs.find((r) => r.id === "cancelamento-alto");
    expect(rec?.severity).toBe("media");
    expect(rec?.description).toContain("Cliente desistiu");
  });

  it("recomenda produtos parados quando há produtos sem venda", () => {
    const recs = buildRecommendations({ ...base, stalledProductsCount: 3 });
    expect(recs.find((r) => r.id === "produtos-parados")?.severity).toBe("baixa");
  });

  it("não recomenda clientes em risco quando a amostra é pequena demais", () => {
    const recs = buildRecommendations({
      ...base,
      atRiskCustomersCount: 5,
      totalCustomersCount: 5,
      minCustomerSample: 10,
    });
    expect(recs.find((r) => r.id === "clientes-em-risco")).toBeUndefined();
  });

  it("recomenda ação de reengajamento quando há clientes em risco com amostra suficiente", () => {
    const recs = buildRecommendations({
      ...base,
      atRiskCustomersCount: 5,
      totalCustomersCount: 10,
      minCustomerSample: 10,
    });
    expect(recs.find((r) => r.id === "clientes-em-risco")).toBeDefined();
  });

  it("ordena por severidade (alta primeiro)", () => {
    const recs = buildRecommendations({
      ...base,
      stalledProductsCount: 3,
      revenueCurrent: 600,
      revenuePrevious: 1000,
    });
    expect(recs[0].severity).toBe("alta");
  });
});
