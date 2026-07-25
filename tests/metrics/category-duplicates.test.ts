import { describe, expect, it } from "vitest";
import { findExactDuplicateGroups, findNearDuplicatePairs, type CategoryDuplicateInput } from "@/lib/metrics/category-duplicates";

describe("findExactDuplicateGroups", () => {
  it("agrupa 'bebidas', 'Bebidas' e 'BEBIDAS' como uma duplicata exata", () => {
    const categories: CategoryDuplicateInput[] = [
      { id: "1", brandId: "b1", canonicalName: "bebidas" },
      { id: "2", brandId: "b1", canonicalName: "Bebidas" },
      { id: "3", brandId: "b1", canonicalName: "BEBIDAS" },
    ];
    const groups = findExactDuplicateGroups(categories);
    expect(groups).toHaveLength(1);
    expect(groups[0].categories.map((c) => c.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("agrupa 'LINHA GOURMET' cadastrada com espaços extras", () => {
    const categories: CategoryDuplicateInput[] = [
      { id: "1", brandId: "b1", canonicalName: "LINHA GOURMET" },
      { id: "2", brandId: "b1", canonicalName: "Linha  Gourmet " },
    ];
    expect(findExactDuplicateGroups(categories)).toHaveLength(1);
  });

  it("agrupa 'SASHIMIS' repetida", () => {
    const categories: CategoryDuplicateInput[] = [
      { id: "1", brandId: "b1", canonicalName: "SASHIMIS" },
      { id: "2", brandId: "b1", canonicalName: "sashimis" },
    ];
    expect(findExactDuplicateGroups(categories)).toHaveLength(1);
  });

  it("não considera duplicata o mesmo nome em marcas diferentes", () => {
    const categories: CategoryDuplicateInput[] = [
      { id: "1", brandId: "b1", canonicalName: "Bebidas" },
      { id: "2", brandId: "b2", canonicalName: "Bebidas" },
    ];
    expect(findExactDuplicateGroups(categories)).toEqual([]);
  });

  it("ignora acento na normalização", () => {
    const categories: CategoryDuplicateInput[] = [
      { id: "1", brandId: "b1", canonicalName: "Sobremesas" },
      { id: "2", brandId: "b1", canonicalName: "Sòbremesás" },
    ];
    expect(findExactDuplicateGroups(categories)).toHaveLength(1);
  });
});

describe("findNearDuplicatePairs", () => {
  it("sugere par com alta similaridade mas nome normalizado diferente", () => {
    const categories: CategoryDuplicateInput[] = [
      { id: "1", brandId: "b1", canonicalName: "Sashimis" },
      { id: "2", brandId: "b1", canonicalName: "Sashimis Especiais" },
    ];
    const pairs = findNearDuplicatePairs(categories);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].score).toBeLessThan(1);
  });

  it("não repete pares que já são duplicata exata", () => {
    const categories: CategoryDuplicateInput[] = [
      { id: "1", brandId: "b1", canonicalName: "Bebidas" },
      { id: "2", brandId: "b1", canonicalName: "BEBIDAS" },
    ];
    expect(findNearDuplicatePairs(categories)).toEqual([]);
  });

  it("não sugere categorias completamente diferentes", () => {
    const categories: CategoryDuplicateInput[] = [
      { id: "1", brandId: "b1", canonicalName: "Bebidas" },
      { id: "2", brandId: "b1", canonicalName: "Sobremesas" },
    ];
    expect(findNearDuplicatePairs(categories)).toEqual([]);
  });
});
