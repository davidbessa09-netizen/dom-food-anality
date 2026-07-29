import { describe, expect, it } from "vitest";
import { computeSyncSince, computeReconciliationSince } from "@/lib/integrations/sync-window";

describe("computeSyncSince", () => {
  it("retorna undefined quando nunca sincronizou (busca tudo)", () => {
    expect(computeSyncSince(null)).toBeUndefined();
  });

  it("aplica sobreposição de 10 minutos por padrão, antes do último sucesso", () => {
    const result = computeSyncSince("2026-07-29T12:00:00.000Z");
    expect(result).toBe("2026-07-29T11:50:00.000Z");
  });

  it("aceita uma sobreposição customizada", () => {
    const result = computeSyncSince("2026-07-29T12:00:00.000Z", 5);
    expect(result).toBe("2026-07-29T11:55:00.000Z");
  });

  it("nunca retorna um horário IGUAL ou depois do último sucesso", () => {
    const lastSynced = "2026-07-29T12:00:00.000Z";
    const result = computeSyncSince(lastSynced)!;
    expect(new Date(result).getTime()).toBeLessThan(new Date(lastSynced).getTime());
  });
});

describe("computeReconciliationSince", () => {
  it("olha 7 dias pra trás por padrão", () => {
    const result = computeReconciliationSince("2026-07-29T12:00:00.000Z");
    expect(result).toBe("2026-07-22T12:00:00.000Z");
  });

  it("aceita uma janela customizada", () => {
    const result = computeReconciliationSince("2026-07-29T12:00:00.000Z", 3);
    expect(result).toBe("2026-07-26T12:00:00.000Z");
  });
});
