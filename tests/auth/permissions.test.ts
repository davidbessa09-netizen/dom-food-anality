import { describe, expect, it } from "vitest";
import { hasWriteAccess } from "@/lib/auth/session";

describe("hasWriteAccess", () => {
  it("permite escrita para admin_geral", () => {
    expect(hasWriteAccess("admin_geral")).toBe(true);
  });

  it("permite escrita para gestor_marca e gestor_loja", () => {
    expect(hasWriteAccess("gestor_marca")).toBe(true);
    expect(hasWriteAccess("gestor_loja")).toBe(true);
  });

  it("nega escrita para analista e somente_leitura", () => {
    expect(hasWriteAccess("analista")).toBe(false);
    expect(hasWriteAccess("somente_leitura")).toBe(false);
  });
});
