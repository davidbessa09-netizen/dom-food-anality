import { describe, expect, it } from "vitest";
import { classifySyncFreshness } from "@/lib/integrations/sync-status";

const now = "2026-07-29T12:00:00.000Z";

describe("classifySyncFreshness", () => {
  it("nunca sincronizou quando não há horário de sucesso", () => {
    expect(classifySyncFreshness(null, now)).toBe("nunca_sincronizou");
  });

  it("atualizado quando dentro de 10 minutos", () => {
    expect(classifySyncFreshness("2026-07-29T11:55:00.000Z", now)).toBe("atualizado");
  });

  it("atrasado entre 10 e 15 minutos", () => {
    expect(classifySyncFreshness("2026-07-29T11:48:00.000Z", now)).toBe("atrasado");
  });

  it("falha acima de 15 minutos", () => {
    expect(classifySyncFreshness("2026-07-29T11:40:00.000Z", now)).toBe("falha");
  });

  it("nunca mostra 'atualizado' só porque o job começou — exige sucesso", () => {
    // Simula: job começou agora mas o último SUCESSO foi há 20min.
    expect(classifySyncFreshness("2026-07-29T11:40:00.000Z", now)).not.toBe("atualizado");
  });
});
