import { describe, expect, it } from "vitest";
import { bestMatch, similarity } from "@/lib/products/similarity";

describe("similarity", () => {
  it("dá pontuação alta para nomes equivalentes com grafias diferentes", () => {
    const score = similarity("Combo Chef 100 peças", "Combo Chef - 100P");
    expect(score).toBeGreaterThan(0.3);
  });

  it("dá pontuação baixa para produtos completamente diferentes", () => {
    const score = similarity("Combo Chef 100 peças", "Refrigerante Lata");
    expect(score).toBeLessThan(0.2);
  });

  it("é 0 quando um dos nomes é vazio", () => {
    expect(similarity("", "Combo Chef")).toBe(0);
  });
});

describe("bestMatch", () => {
  it("retorna o candidato com maior similaridade", () => {
    const candidates = ["Refrigerante Lata", "Combo Chef 100 Unidades", "Temaki Salmão"];
    const match = bestMatch("CHEF 100 UN", candidates, (c) => c);
    expect(match?.item).toBe("Combo Chef 100 Unidades");
  });

  it("retorna null quando não há nenhuma sobreposição", () => {
    const match = bestMatch("Produto Totalmente Novo", ["Refrigerante Lata"], (c) => c);
    expect(match).toBeNull();
  });
});
