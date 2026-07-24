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
