import { describe, expect, it } from "vitest";
import { normalizeSearchText, matchesSearch } from "@/lib/text/normalize";

describe("normalizeSearchText", () => {
  it("converte para minusculas", () => {
    expect(normalizeSearchText("COMBO MIX")).toBe("combo mix");
  });

  it("remove acentos", () => {
    expect(normalizeSearchText("Tarê")).toBe("tare");
    expect(normalizeSearchText("PEÇAS")).toBe("pecas");
  });

  it("colapsa espacos duplicados e aplica trim", () => {
    expect(normalizeSearchText("  combo   mix  ")).toBe("combo mix");
  });
});

describe("matchesSearch", () => {
  it("casa uma unica letra contida no nome", () => {
    expect(matchesSearch("Buffet Livre", "m")).toBe(false);
    expect(matchesSearch("Combo Mix", "m")).toBe(true);
  });

  it("casa termo parcial ignorando caixa e acento", () => {
    expect(matchesSearch("COMBO MIX (100 PEÇAS) + 1 Pureza 1lt", "combo")).toBe(true);
    expect(matchesSearch("COMBO MIX (100 PEÇAS) + 1 Pureza 1lt", "pecas")).toBe(true);
  });

  it("exige todos os termos da busca, em qualquer ordem", () => {
    expect(matchesSearch("COMBO MIX (100 PEÇAS) + 1 Pureza 1lt", "combo mix pureza")).toBe(true);
    expect(matchesSearch("COMBO MIX (100 PEÇAS) + 1 Tarê", "combo mix pureza")).toBe(false);
  });

  it("string vazia casa com tudo", () => {
    expect(matchesSearch("Qualquer coisa", "")).toBe(true);
    expect(matchesSearch("Qualquer coisa", "   ")).toBe(true);
  });

  it("nao encontra termo ausente", () => {
    expect(matchesSearch("Combo Mix", "buffet")).toBe(false);
  });
});
