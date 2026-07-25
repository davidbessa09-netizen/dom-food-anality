import { isPeriodPreset, resolveCustomPeriod, resolvePeriod, type Period, type PeriodPreset } from "@/lib/dates/period";
import type { ComparisonMode } from "./types";

export interface ParsedFilters {
  brandId: string | null;
  storeIds: string[];
  cityIds: string[];
  channel: string | null;
  category: string | null;
  period: Period;
  periodPreset: PeriodPreset;
  customFrom?: string;
  customTo?: string;
  compare: ComparisonMode;
  status: string | null;
  fulfillment: string | null;
}

type SearchParams = Record<string, string | string[] | undefined>;

function getString(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Ponto único de leitura dos filtros globais a partir da URL — evita que
 * cada página reimplemente o mesmo parsing de período/marca/loja (ver
 * METRICS.md sobre o padrão de filtros compartilhado entre telas).
 */
export function parseFilters(params: SearchParams): ParsedFilters {
  const rawPeriod = getString(params, "period") ?? "30d";
  const periodPreset: PeriodPreset = isPeriodPreset(rawPeriod) ? rawPeriod : "30d";
  const customFrom = getString(params, "from");
  const customTo = getString(params, "to");
  const period = customFrom && customTo ? resolveCustomPeriod(customFrom, customTo) : resolvePeriod(periodPreset);

  const storesRaw = getString(params, "stores");
  const storeIds = storesRaw ? storesRaw.split(",").filter(Boolean) : [];

  const cityRaw = getString(params, "city");
  const cityIds = cityRaw ? cityRaw.split(",").filter(Boolean) : [];

  const compareRaw = getString(params, "compare");
  const compare: ComparisonMode =
    compareRaw === "previous_period" || compareRaw === "previous_year" ? compareRaw : "none";

  return {
    brandId: getString(params, "brand") ?? null,
    storeIds,
    cityIds,
    channel: getString(params, "channel") ?? null,
    category: getString(params, "category") ?? null,
    period,
    periodPreset,
    customFrom,
    customTo,
    compare,
    status: getString(params, "status") ?? null,
    fulfillment: getString(params, "fulfillment") ?? null,
  };
}
