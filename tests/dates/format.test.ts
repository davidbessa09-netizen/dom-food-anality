import { describe, expect, it } from "vitest";
import { formatDateTimeBR, formatDateBR, formatDayLabel } from "@/lib/dates/format";

describe("formatDateTimeBR / formatDateBR", () => {
  it("mostra o horário no fuso America/Sao_Paulo independente do fuso do runtime", () => {
    // 21:22 UTC = 18:22 em São Paulo (UTC-3) — se o runtime rodasse em UTC
    // sem a correção, apareceria 21:22, não 18:22.
    const iso = "2026-07-25T21:22:00Z";
    expect(formatDateTimeBR(iso, { hour: "2-digit", minute: "2-digit", hour12: false })).toBe("18:22");
  });

  it("pode virar o dia ao converter pra São Paulo perto da meia-noite UTC", () => {
    // 02:00 UTC de um dia = 23:00 do dia anterior em São Paulo.
    const iso = "2026-07-26T02:00:00Z";
    expect(formatDateBR(iso)).toBe("25/07/2026");
  });
});

describe("formatDayLabel", () => {
  it("formata yyyy-MM-dd como dd/MM sem passar por conversão de fuso", () => {
    expect(formatDayLabel("2026-07-25")).toBe("25/07");
  });
});
