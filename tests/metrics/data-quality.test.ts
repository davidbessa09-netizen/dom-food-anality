import { describe, expect, it } from "vitest";
import { findDuplicateCategories, findDuplicateProducts, type CategoryInput, type ProductInput } from "@/lib/metrics/data-quality";

describe("findDuplicateCategories", () => {
  it("detecta categorias com nomes iguais (case-insensitive) na mesma marca", () => {
    const categories: CategoryInput[] = [
      { id: "1", brand_id: "brand-a", canonical_name: "Bebidas" },
      { id: "2", brand_id: "brand-a", canonical_name: "bebidas" },
      { id: "3", brand_id: "brand-a", canonical_name: "BEBIDAS" },
    ];
    const groups = findDuplicateCategories(categories);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toEqual(["1", "2", "3"]);
  });

  it("não considera duplicata o mesmo nome em marcas diferentes", () => {
    const categories: CategoryInput[] = [
      { id: "1", brand_id: "brand-a", canonical_name: "Bebidas" },
      { id: "2", brand_id: "brand-b", canonical_name: "Bebidas" },
    ];
    expect(findDuplicateCategories(categories)).toEqual([]);
  });

  it("não reporta categorias sem duplicata", () => {
    const categories: CategoryInput[] = [{ id: "1", brand_id: "brand-a", canonical_name: "Bebidas" }];
    expect(findDuplicateCategories(categories)).toEqual([]);
  });
});

describe("findDuplicateProducts", () => {
  it("detecta produtos com nomes iguais (case-insensitive) na mesma marca", () => {
    const products: ProductInput[] = [
      { id: "1", brand_id: "brand-a", canonical_name: "Coca-Cola" },
      { id: "2", brand_id: "brand-a", canonical_name: "coca-cola" },
    ];
    const groups = findDuplicateProducts(products);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toEqual(["1", "2"]);
  });

  it("não considera duplicata o mesmo nome em marcas diferentes", () => {
    const products: ProductInput[] = [
      { id: "1", brand_id: "brand-a", canonical_name: "Coca-Cola" },
      { id: "2", brand_id: "brand-b", canonical_name: "Coca-Cola" },
    ];
    expect(findDuplicateProducts(products)).toEqual([]);
  });
});
