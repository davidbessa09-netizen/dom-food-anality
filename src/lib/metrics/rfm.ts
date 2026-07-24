// Segmentação RFM (Recência, Frequência, Valor monetário) — ver METRICS.md.
// Classificação SEMPRE "estimado": os limiares são percentis relativos à base
// atual de clientes, não valores fixos, e podem mudar conforme a base cresce.

export interface CustomerOrderInput {
  customer_id: string;
  gross_amount: number;
  ordered_at: string; // ISO
}

export interface CustomerRfmStats {
  customerId: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  firstOrderAt: string;
  lastOrderAt: string;
}

export function computeCustomerStats(
  orders: CustomerOrderInput[],
  now: string
): CustomerRfmStats[] {
  const byCustomer = new Map<string, { orders: CustomerOrderInput[] }>();
  for (const o of orders) {
    const entry = byCustomer.get(o.customer_id);
    if (entry) entry.orders.push(o);
    else byCustomer.set(o.customer_id, { orders: [o] });
  }

  const nowMs = new Date(now).getTime();

  return Array.from(byCustomer.entries()).map(([customerId, { orders: custOrders }]) => {
    const sorted = [...custOrders].sort((a, b) => a.ordered_at.localeCompare(b.ordered_at));
    const firstOrderAt = sorted[0].ordered_at;
    const lastOrderAt = sorted[sorted.length - 1].ordered_at;
    const monetary = custOrders.reduce((sum, o) => sum + o.gross_amount, 0);
    const recencyDays = Math.floor((nowMs - new Date(lastOrderAt).getTime()) / (1000 * 60 * 60 * 24));

    return { customerId, recencyDays, frequency: custOrders.length, monetary, firstOrderAt, lastOrderAt };
  });
}

/**
 * Score de 1 (pior) a 5 (melhor) por percentil dentro do próprio conjunto.
 *
 * Para métricas "menor é melhor" (recência), inverte o SINAL antes de
 * calcular o rank — em vez de calcular o rank normalmente e inverter o score
 * depois. Isso importa em conjuntos com empate total (ex.: todos os clientes
 * compraram há 0 dias): invertendo o score no final, o empate no valor
 * MÁXIMO (rank 100%) virava sempre o PIOR score, mesmo quando esse valor
 * empatado era objetivamente o melhor caso possível (recência zero).
 * Invertendo o sinal antes evita essa armadilha.
 */
function percentileScore(value: number, sortedAsc: number[], higherIsBetter: boolean): number {
  if (sortedAsc.length <= 1) return 3;
  const effectiveValue = higherIsBetter ? value : -value;
  const effectiveSorted = higherIsBetter ? sortedAsc : sortedAsc.map((v) => -v).sort((a, b) => a - b);
  const rank = effectiveSorted.filter((v) => v <= effectiveValue).length / effectiveSorted.length;
  return Math.max(1, Math.min(5, Math.ceil(rank * 5)));
}

export type RfmSegment =
  | "Novos"
  | "Clientes fiéis"
  | "Clientes de alto valor"
  | "Em crescimento"
  | "Em risco"
  | "Inativos"
  | "Perdidos";

export interface CustomerRfmRow extends CustomerRfmStats {
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  segment: RfmSegment;
}

function classifySegment(recencyScore: number, frequencyScore: number, monetaryScore: number, frequency: number): RfmSegment {
  if (frequency === 1 && recencyScore >= 4) return "Novos";
  if (recencyScore <= 1 && frequencyScore <= 2) return "Perdidos";
  if (recencyScore <= 2) return "Inativos";
  if (recencyScore >= 4 && frequencyScore >= 4) return "Clientes fiéis";
  if (monetaryScore >= 4) return "Clientes de alto valor";
  if (recencyScore <= 2 && frequencyScore >= 3) return "Em risco";
  return "Em crescimento";
}

/** Calcula o score RFM (1-5, percentil relativo) e classifica o segmento de cada cliente. */
export function buildRfmSegmentation(stats: CustomerRfmStats[]): CustomerRfmRow[] {
  const recencies = stats.map((s) => s.recencyDays).sort((a, b) => a - b);
  const frequencies = stats.map((s) => s.frequency).sort((a, b) => a - b);
  const monetaries = stats.map((s) => s.monetary).sort((a, b) => a - b);

  return stats.map((s) => {
    const recencyScore = percentileScore(s.recencyDays, recencies, false);
    const frequencyScore = percentileScore(s.frequency, frequencies, true);
    const monetaryScore = percentileScore(s.monetary, monetaries, true);
    const segment = classifySegment(recencyScore, frequencyScore, monetaryScore, s.frequency);
    return { ...s, recencyScore, frequencyScore, monetaryScore, segment };
  });
}
