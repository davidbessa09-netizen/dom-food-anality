import { describe, expect, it } from "vitest";
import { previousPeriod, resolveCustomPeriod, resolvePeriod } from "@/lib/dates/period";

describe("resolvePeriod", () => {
  it("30d cobre 30 dias incluindo hoje", () => {
    const { start, end } = resolvePeriod("30d");
    const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(days).toBe(30); // diferença entre 00:00 de D-29 e 23:59:59 de hoje arredonda para 30
  });

  it("hoje começa e termina no mesmo dia", () => {
    const { start, end } = resolvePeriod("hoje");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });
});

describe("previousPeriod", () => {
  it("gera um período imediatamente anterior com a mesma duração", () => {
    const current = resolvePeriod("7d");
    const previous = previousPeriod(current);
    const currentDuration = current.end.getTime() - current.start.getTime();
    const previousDuration = previous.end.getTime() - previous.start.getTime();
    expect(previousDuration).toBeCloseTo(currentDuration, -2);
    expect(previous.end.getTime()).toBeLessThan(current.start.getTime());
  });
});

describe("limites de dia em America/Sao_Paulo (independente do fuso do runtime)", () => {
  // 08/10/2026 10:00 BRT = 13:00Z
  const now = new Date("2026-10-08T13:00:00.000Z");

  it("período personalizado 28/09 cobre 28/09 00:00 a 23:59:59.999 BRT", () => {
    const { start, end } = resolveCustomPeriod("2026-09-28", "2026-09-28");
    expect(start.toISOString()).toBe("2026-09-28T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-29T02:59:59.999Z");
  });

  it("setembro inteiro", () => {
    const { start, end } = resolveCustomPeriod("2026-09-01", "2026-09-30");
    expect(start.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-01T02:59:59.999Z");
  });

  it("hoje e ontem", () => {
    expect(resolvePeriod("hoje", now).start.toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(resolvePeriod("hoje", now).end.toISOString()).toBe("2026-10-09T02:59:59.999Z");
    expect(resolvePeriod("ontem", now).start.toISOString()).toBe("2026-10-07T03:00:00.000Z");
  });

  it("às 22h BRT (já 01h UTC do dia seguinte) 'hoje' continua sendo o dia de Brasília", () => {
    const lateNight = new Date("2026-10-09T01:00:00.000Z"); // 08/10 22:00 BRT
    expect(resolvePeriod("hoje", lateNight).start.toISOString()).toBe("2026-10-08T03:00:00.000Z");
  });

  it("este mês e mês anterior (inclui virada de ano)", () => {
    expect(resolvePeriod("este_mes", now).start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    const prev = resolvePeriod("mes_anterior", now);
    expect(prev.start.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(prev.end.toISOString()).toBe("2026-10-01T02:59:59.999Z");
    const jan = resolvePeriod("mes_anterior", new Date("2026-01-15T12:00:00Z"));
    expect(jan.start.toISOString()).toBe("2025-12-01T03:00:00.000Z");
    expect(jan.end.toISOString()).toBe("2026-01-01T02:59:59.999Z");
  });

  it("30d cobre D-29 00:00 até hoje 23:59 BRT", () => {
    const { start } = resolvePeriod("30d", now);
    expect(start.toISOString()).toBe("2026-09-09T03:00:00.000Z");
  });
});
import { describe, expect, it } from "vitest";
import { previousPeriod, resolvePeriod } from "@/lib/dates/period";

describe("resolvePeriod", () => {
  it("30d cobre 30 dias incluindo hoje", () => {
    const { start, end } = resolvePeriod("30d");
    const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    expect(days).toBe(30); // diferença entre 00:00 de D-29 e 23:59:59 de hoje arredonda para 30
  });

  it("hoje começa e termina no mesmo dia", () => {
    const { start, end } = resolvePeriod("hoje");
    expect(start.toDateString()).toBe(end.toDateString());
  });
});

describe("previousPeriod", () => {
  it("gera um período imediatamente anterior com a mesma duração", () => {
    const current = resolvePeriod("7d");
    const previous = previousPeriod(current);
    const currentDuration = current.end.getTime() - current.start.getTime();
    const previousDuration = previous.end.getTime() - previous.start.getTime();
    expect(previousDuration).toBeCloseTo(currentDuration, -2);
    expect(previous.end.getTime()).toBeLessThan(current.start.getTime());
  });
});
