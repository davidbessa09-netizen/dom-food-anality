// Agregação pura pra "Produtos vendidos" do perfil restrito (Visualizador
// de produtos) — deliberadamente mais simples que buildProductSalesSummaries
// (sem correspondência canônica entre plataformas): agrupa só pelo nome
// original do item, e inclui a divisão por dia real da venda (nunca a data
// de sincronização), usada pra expandir a linha em "Últimos 7 dias".

import { APP_TIMEZONE } from "@/lib/dates/period";
import { filterAccountable, type SaleItemEvent } from "./live-sales";

export interface ViewerDailyBreakdown {
  date: string; // yyyy-MM-dd no fuso da aplicação
  quantity: number;
}

export interface ViewerProductSummary {
  productName: string;
  quantity: number;
  lastSoldAt: string;
  byDay: ViewerDailyBreakdown[]; // ordenado do dia mais recente pro mais antigo
}

function dateKeyInTz(iso: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date(iso)); // en-CA já formata como yyyy-MM-dd
}

/** Só considera pedidos em estado comercial válido (mesma regra
 * compartilhada com o resto do app — ver [[filterAccountable]]), nunca
 * conta um pedido cancelado como venda. */
export function buildViewerProductSummaries(events: SaleItemEvent[]): ViewerProductSummary[] {
  const accountable = filterAccountable(events);

  interface Acc {
    quantity: number;
    lastSoldAt: string;
    byDay: Map<string, number>;
  }
  const byName = new Map<string, Acc>();

  for (const e of accountable) {
    const acc = byName.get(e.productName) ?? { quantity: 0, lastSoldAt: e.orderedAt, byDay: new Map<string, number>() };
    acc.quantity += e.quantity;
    if (e.orderedAt > acc.lastSoldAt) acc.lastSoldAt = e.orderedAt;
    const day = dateKeyInTz(e.orderedAt);
    acc.byDay.set(day, (acc.byDay.get(day) ?? 0) + e.quantity);
    byName.set(e.productName, acc);
  }

  return Array.from(byName.entries())
    .map(([productName, acc]) => ({
      productName,
      quantity: acc.quantity,
      lastSoldAt: acc.lastSoldAt,
      byDay: Array.from(acc.byDay.entries())
        .map(([date, quantity]) => ({ date, quantity }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => b.quantity - a.quantity);
}
