import { describe, expect, it } from "vitest";
import { classifyLowPerformers } from "@/lib/metrics/product-performance";

const NOW = "2026-07-25T00:00:00Z";
const OLD_ENOUGH = "2026-01-01T00:00:00Z"; // bem além de qualquer minSampleDays razoável

function baseParams(overrides: Partial<Parameters<typeof classifyLowPerformers>[0]> = {}) {
  return {
    products: [],
    periodQuantityByName: new Map<string, number>(),
    allTimeSalesByName: new Map(),
    addonOnlyNames: new Set<string>(),
    duplicateNames: new Set<string>(),
    now: NOW,
    minSampleDays: 14,
    lowQuantityThreshold: 3,
    staleDaysThreshold: 30,
    ...overrides,
  };
}

describe("classifyLowPerformers", () => {
  it("classifica 'nunca_vendeu' quando não há registro de venda em todo o histórico", () => {
    const result = classifyLowPerformers(
      baseParams({
        products: [{ id: "p1", canonical_name: "Produto X", is_active: true, created_at: OLD_ENOUGH }],
      })
    );
    expect(result.rows).toEqual([
      expect.objectContaining({ id: "p1", reason: "nunca_vendeu", daysSinceLastSale: null }),
    ]);
  });

  it("classifica 'sem_venda_recente' quando a última venda passou do limite", () => {
    const result = classifyLowPerformers(
      baseParams({
        products: [{ id: "p1", canonical_name: "Produto X", is_active: true, created_at: OLD_ENOUGH }],
        allTimeSalesByName: new Map([["Produto X", { name: "Produto X", lastSoldAt: "2026-06-01T00:00:00Z", totalQuantity: 50 }]]),
      })
    );
    expect(result.rows[0].reason).toBe("sem_venda_recente");
    expect(result.rows[0].daysSinceLastSale).toBeGreaterThan(30);
  });

  it("classifica 'vendeu_pouco' quando venda recente mas quantidade no período é baixa", () => {
    const result = classifyLowPerformers(
      baseParams({
        products: [{ id: "p1", canonical_name: "Produto X", is_active: true, created_at: OLD_ENOUGH }],
        allTimeSalesByName: new Map([["Produto X", { name: "Produto X", lastSoldAt: "2026-07-24T00:00:00Z", totalQuantity: 50 }]]),
        periodQuantityByName: new Map([["Produto X", 2]]),
      })
    );
    expect(result.rows[0].reason).toBe("vendeu_pouco");
  });

  it("não classifica produto saudável (venda recente e quantidade acima do limiar)", () => {
    const result = classifyLowPerformers(
      baseParams({
        products: [{ id: "p1", canonical_name: "Produto X", is_active: true, created_at: OLD_ENOUGH }],
        allTimeSalesByName: new Map([["Produto X", { name: "Produto X", lastSoldAt: "2026-07-24T00:00:00Z", totalQuantity: 50 }]]),
        periodQuantityByName: new Map([["Produto X", 20]]),
      })
    );
    expect(result.rows).toEqual([]);
  });

  it("exclui produtos inativos, adicional-only e duplicados em vez de classificar", () => {
    const result = classifyLowPerformers(
      baseParams({
        products: [
          { id: "p1", canonical_name: "Inativo", is_active: false, created_at: OLD_ENOUGH },
          { id: "p2", canonical_name: "Molho", is_active: true, created_at: OLD_ENOUGH },
          { id: "p3", canonical_name: "Dup", is_active: true, created_at: OLD_ENOUGH },
        ],
        addonOnlyNames: new Set(["Molho"]),
        duplicateNames: new Set(["Dup"]),
      })
    );
    expect(result.rows).toEqual([]);
    expect(result.excluded).toEqual([
      { id: "p1", name: "Inativo", reason: "inativo" },
      { id: "p2", name: "Molho", reason: "adicional" },
      { id: "p3", name: "Dup", reason: "duplicado" },
    ]);
  });

  it("marca amostra insuficiente pra produto cadastrado recentemente, sem classificar", () => {
    const result = classifyLowPerformers(
      baseParams({
        products: [{ id: "p1", canonical_name: "Novo", is_active: true, created_at: "2026-07-20T00:00:00Z" }],
      })
    );
    expect(result.rows).toEqual([]);
    expect(result.insufficientSample).toEqual([{ id: "p1", name: "Novo" }]);
  });
});
