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
