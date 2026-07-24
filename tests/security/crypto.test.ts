import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = "test-key-only-for-unit-tests";
});

describe("encryptSecret/decryptSecret", () => {
  it("faz round-trip corretamente", () => {
    const original = "meu-token-super-secreto-da-anota-ai";
    const encrypted = encryptSecret(original);
    expect(encrypted).not.toContain(original);
    expect(decryptSecret(encrypted)).toBe(original);
  });

  it("gera valores diferentes a cada chamada (IV aleatório)", () => {
    const a = encryptSecret("mesmo-valor");
    const b = encryptSecret("mesmo-valor");
    expect(a).not.toBe(b);
  });

  it("lança erro para formato inválido", () => {
    expect(() => decryptSecret("valor-sem-formato-esperado")).toThrow();
  });
});
