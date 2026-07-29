import { describe, expect, it } from "vitest";
import { usernameToSyntheticEmail, resolveLoginEmail, isViewerOnlyRoles } from "@/lib/auth/username";

describe("usernameToSyntheticEmail", () => {
  it("gera um e-mail determinístico e sempre em minúsculas", () => {
    expect(usernameToSyntheticEmail("gerenteGulas")).toBe("gerentegulas@users.dom-food-analytics.internal");
    expect(usernameToSyntheticEmail("gerenteGulas")).toBe(usernameToSyntheticEmail("gerentegulas"));
  });

  it("remove espaços nas pontas", () => {
    expect(usernameToSyntheticEmail("  david.admin  ")).toBe("david.admin@users.dom-food-analytics.internal");
  });
});

describe("resolveLoginEmail", () => {
  it("trata texto sem @ como nome de usuário", () => {
    expect(resolveLoginEmail("producaokings")).toBe("producaokings@users.dom-food-analytics.internal");
  });

  it("trata texto com @ como e-mail real, sem alterar (só normalizando caixa)", () => {
    expect(resolveLoginEmail("Admin@Empresa.com")).toBe("admin@empresa.com");
  });
});

describe("isViewerOnlyRoles", () => {
  it("verdadeiro quando todos os vínculos são products_viewer", () => {
    expect(isViewerOnlyRoles(["products_viewer"])).toBe(true);
    expect(isViewerOnlyRoles(["products_viewer", "products_viewer"])).toBe(true);
  });

  it("falso quando há qualquer outro papel junto", () => {
    expect(isViewerOnlyRoles(["products_viewer", "gestor_loja"])).toBe(false);
    expect(isViewerOnlyRoles(["admin_geral"])).toBe(false);
  });

  it("falso quando não há nenhum vínculo", () => {
    expect(isViewerOnlyRoles([])).toBe(false);
  });
});
