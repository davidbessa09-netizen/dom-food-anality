export const APP_TIMEZONE = "America/Sao_Paulo";

/**
 * America/Sao_Paulo não tem horário de verão desde 2019 — offset SEMPRE
 * -03:00. Os limites de dia são calculados com aritmética fixa em UTC, sem
 * TZDate/date-fns: confirmado ao vivo (2026-08-13 no Bar Fácil e de novo em
 * 2026-10-08 aqui) que TZDate + startOfDay/endOfDay resolvem SEM o offset
 * no runtime da Vercel. Resultado do bug: o filtro "28/09" buscava de 27/09
 * 21:00 até 28/09 20:59 (BRT) — 3h de atraso em todo período/relatório.
 */
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PeriodPreset =
  | "hoje"
  | "ontem"
  | "7d"
  | "15d"
  | "30d"
  | "este_mes"
  | "mes_anterior";

export interface Period {
  start: Date;
  end: Date;
}

interface DayParts {
  year: number;
  month: number; // 0-11
  day: number;
}

/** Ano/mês/dia de "agora" no calendário de Brasília. */
function todayBRT(now: Date = new Date()): DayParts {
  const shifted = new Date(now.getTime() - BRT_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** 00:00:00.000 BRT do dia informado (aceita day/month fora do intervalo — Date.UTC normaliza). */
function startOfDayBRT({ year, month, day }: DayParts): Date {
  return new Date(Date.UTC(year, month, day) + BRT_OFFSET_MS);
}

/** 23:59:59.999 BRT do dia informado. */
function endOfDayBRT(parts: DayParts): Date {
  return new Date(startOfDayBRT(parts).getTime() + DAY_MS - 1);
}

function addDays(parts: DayParts, delta: number): DayParts {
  return { ...parts, day: parts.day + delta };
}

function parseDateStr(dateStr: string): DayParts {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month: month - 1, day };
}

/** Calcula início/fim do período (limites de dia em America/Sao_Paulo) a partir de um preset. */
export function resolvePeriod(preset: PeriodPreset, now: Date = new Date()): Period {
  const today = todayBRT(now);

  switch (preset) {
    case "hoje":
      return { start: startOfDayBRT(today), end: endOfDayBRT(today) };
    case "ontem": {
      const yesterday = addDays(today, -1);
      return { start: startOfDayBRT(yesterday), end: endOfDayBRT(yesterday) };
    }
    case "7d":
      return { start: startOfDayBRT(addDays(today, -6)), end: endOfDayBRT(today) };
    case "15d":
      return { start: startOfDayBRT(addDays(today, -14)), end: endOfDayBRT(today) };
    case "30d":
      return { start: startOfDayBRT(addDays(today, -29)), end: endOfDayBRT(today) };
    case "este_mes":
      return { start: startOfDayBRT({ ...today, day: 1 }), end: endOfDayBRT(today) };
    case "mes_anterior":
      return {
        start: startOfDayBRT({ year: today.year, month: today.month - 1, day: 1 }),
        end: endOfDayBRT({ year: today.year, month: today.month, day: 0 }),
      };
    default:
      return { start: startOfDayBRT(addDays(today, -29)), end: endOfDayBRT(today) };
  }
}

/** Período imediatamente anterior, com a mesma duração — usado para "crescimento vs. período anterior". */
export function previousPeriod(period: Period): Period {
  const durationMs = period.end.getTime() - period.start.getTime();
  return {
    start: new Date(period.start.getTime() - durationMs - 1),
    end: new Date(period.start.getTime() - 1),
  };
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "Últimos 7 dias",
  "15d": "Últimos 15 dias",
  "30d": "Últimos 30 dias",
  este_mes: "Este mês",
  mes_anterior: "Mês anterior",
};

export function isPeriodPreset(value: string): value is PeriodPreset {
  return value in PERIOD_LABELS;
}

/** Constrói um período a partir de datas "yyyy-MM-dd" (filtro de calendário / intervalo personalizado). */
export function resolveCustomPeriod(fromDateStr: string, toDateStr: string): Period {
  return { start: startOfDayBRT(parseDateStr(fromDateStr)), end: endOfDayBRT(parseDateStr(toDateStr)) };
}

/** Um único dia "yyyy-MM-dd" (00:00:00.000 a 23:59:59.999 BRT). */
export function resolveDayPeriod(dateStr: string): Period {
  return resolveCustomPeriod(dateStr, dateStr);
}
import { TZDate } from "@date-fns/tz";
import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";

export const APP_TIMEZONE = "America/Sao_Paulo";

export type PeriodPreset =
  | "hoje"
  | "ontem"
  | "7d"
  | "15d"
  | "30d"
  | "este_mes"
  | "mes_anterior";

export interface Period {
  start: Date;
  end: Date;
}

function nowInTz(): Date {
  return new TZDate(new Date(), APP_TIMEZONE);
}

/** Calcula início/fim do período (limites de dia em America/Sao_Paulo) a partir de um preset. */
export function resolvePeriod(preset: PeriodPreset): Period {
  const now = nowInTz();

  switch (preset) {
    case "hoje":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "ontem": {
      const yesterday = subDays(now, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }
    case "7d":
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case "15d":
      return { start: startOfDay(subDays(now, 14)), end: endOfDay(now) };
    case "30d":
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case "este_mes":
      return { start: startOfMonth(now), end: endOfDay(now) };
    case "mes_anterior": {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    default:
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
  }
}

/** Período imediatamente anterior, com a mesma duração — usado para "crescimento vs. período anterior". */
export function previousPeriod(period: Period): Period {
  const durationMs = period.end.getTime() - period.start.getTime();
  return {
    start: new Date(period.start.getTime() - durationMs - 1),
    end: new Date(period.start.getTime() - 1),
  };
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "Últimos 7 dias",
  "15d": "Últimos 15 dias",
  "30d": "Últimos 30 dias",
  este_mes: "Este mês",
  mes_anterior: "Mês anterior",
};

export function isPeriodPreset(value: string): value is PeriodPreset {
  return value in PERIOD_LABELS;
}

/** Constrói um período a partir de datas "yyyy-MM-dd" (filtro de calendário / intervalo personalizado). */
export function resolveCustomPeriod(fromDateStr: string, toDateStr: string): Period {
  const from = new TZDate(`${fromDateStr}T00:00:00`, APP_TIMEZONE);
  const to = new TZDate(`${toDateStr}T00:00:00`, APP_TIMEZONE);
  return { start: startOfDay(from), end: endOfDay(to) };
}
