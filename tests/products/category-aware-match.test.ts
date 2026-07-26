import { describe, expect, it } from "vitest";
import { bestMatchWithCategory, isSafeForBulkResolution } from "@/lib/products/category-aware-match";

describe("bestMatchWithCategory", () => {
  it("prioriza candidatos da mesma categoria quando a categoria de origem é conhecida", () => {
    const suggestion = bestMatchWithCategory("Combo Chef 100 peças", "Combinados", [
      { id: "1", canonical_name: "Combo Chef 100 UN", category_name: "Bebidas" },
      { id: "2", canonical_name: "Combo Chef", category_name: "Combinados" },
    ]);
    expect(suggestion?.productId).toBe("2");
    expect(suggestion?.categoryMatches).toBe(true);
  });

  it("cai para todos os candidatos da marca quando nenhum compartilha a categoria, mas sinaliza divergência", () => {
    const suggestion = bestMatchWithCategory("Combo Chef 100 peças", "Combinados", [
      { id: "1", canonical_name: "Combo Chef 100 UN", category_name: "Bebidas" },
    ]);
    expect(suggestion?.productId).toBe("1");
    expect(suggestion?.categoryMatches).toBe(false);
  });

  it("retorna categoryMatches null quando não há categoria de origem ou do candidato", () => {
    const suggestion = bestMatchWithCategory("Combo Chef 100 peças", null, [
      { id: "1", canonical_name: "Combo Chef 100 UN", category_name: null },
    ]);
    expect(suggestion?.categoryMatches).toBeNull();
  });

  it("retorna null sem candidatos", () => {
    expect(bestMatchWithCategory("X", null, [])).toBeNull();
  });
});

describe("isSafeForBulkResolution", () => {
  it("não é seguro quando a categoria diverge, mesmo com score alto", () => {
    const suggestion = { productId: "1", name: "X", score: 0.95, categoryMatches: false as const };
    expect(isSafeForBulkResolution(suggestion, 0.85)).toBe(false);
  });

  it("é seguro quando o score passa do limite e a categoria bate ou é desconhecida", () => {
    expect(isSafeForBulkResolution({ productId: "1", name: "X", score: 0.9, categoryMatches: true }, 0.85)).toBe(true);
    expect(isSafeForBulkResolution({ productId: "1", name: "X", score: 0.9, categoryMatches: null }, 0.85)).toBe(true);
  });

  it("não é seguro abaixo do limite de score", () => {
    expect(isSafeForBulkResolution({ productId: "1", name: "X", score: 0.5, categoryMatches: true }, 0.85)).toBe(false);
  });

  it("não é seguro sem sugestão", () => {
    expect(isSafeForBulkResolution(null, 0.85)).toBe(false);
  });
});
