import { describe, expect, it, vi } from "vitest";
import { withRetry, isDefinitiveAuthError } from "@/lib/integrations/retry";

const noDelay = { delay: async () => {} };

describe("isDefinitiveAuthError", () => {
  it("reconhece erro de autenticação", () => {
    expect(isDefinitiveAuthError(new Error("401 Unauthorized"))).toBe(true);
    expect(isDefinitiveAuthError(new Error("Falha ao decodificar credencial"))).toBe(true);
  });

  it("não confunde erro de rede com erro de autenticação", () => {
    expect(isDefinitiveAuthError(new Error("network timeout"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("retorna o resultado direto quando a primeira tentativa funciona", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, noDelay);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("tenta de novo em falha transitória, até o limite de retries", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { ...noDelay, retries: 2 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("desiste depois de esgotar as retentativas", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network timeout"));
    await expect(withRetry(fn, { ...noDelay, retries: 2 })).rejects.toThrow("network timeout");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("nunca repete erro definitivo de autenticação", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));
    await expect(withRetry(fn, { ...noDelay, retries: 2 })).rejects.toThrow("401");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
