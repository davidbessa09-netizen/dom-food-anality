import { describe, expect, it } from "vitest";
import { loginSchema, recoverPasswordSchema } from "@/lib/validations/auth";

describe("loginSchema", () => {
  it("aceita e-mail e senha válidos", () => {
    const result = loginSchema.safeParse({ identifier: "a@b.com", password: "123456" });
    expect(result.success).toBe(true);
  });

  it("aceita nome de usuário (sem @) e senha válidos", () => {
    const result = loginSchema.safeParse({ identifier: "gerentegulas", password: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejeita identificador curto demais", () => {
    const result = loginSchema.safeParse({ identifier: "ab", password: "123456" });
    expect(result.success).toBe(false);
  });

  it("rejeita senha curta", () => {
    const result = loginSchema.safeParse({ identifier: "a@b.com", password: "123" });
    expect(result.success).toBe(false);
  });
});

describe("recoverPasswordSchema", () => {
  it("aceita e-mail válido", () => {
    expect(recoverPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("rejeita e-mail inválido", () => {
    expect(recoverPasswordSchema.safeParse({ email: "x" }).success).toBe(false);
  });
});
