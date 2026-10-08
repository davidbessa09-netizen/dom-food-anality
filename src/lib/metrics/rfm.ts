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
  const byCustomer = new Map<string, { first: string; last: string; count: number; monetary: number }>();
  for (const o of orders) {
    const e = byCustomer.get(o.customer_id);
    if (!e) {
      byCustomer.set(o.customer_id, { first: o.ordered_at, last: o.ordered_at, count: 1, monetary: o.gross_amount });
      continue;
    }
    if (o.ordered_at.localeCompare(e.first) < 0) e.first = o.ordered_at;
    if (o.ordered_at.localeCompare(e.last) > 0) e.last = o.ordered_at;
    e.count += 1;
    e.monetary += o.gross_amount;
  }

  const nowMs = new Date(now).getTime();

  return Array.from(byCustomer.entries()).map(([customerId, e]) => {
    const recencyDays = Math.floor((nowMs - new Date(e.last).getTime()) / (1000 * 60 * 60 * 24));
    return {
      customerId,
      recencyDays,
      frequency: e.count,
      monetary: e.monetary,
      firstOrderAt: e.first,
      lastOrderAt: e.last,
    };
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
  // Equivalente a: inverter o sinal (se "menor é melhor") e contar quantos
  // valores efetivos são <= ao valor efetivo. Feito com busca binária sobre
  // o array já ordenado — antes era filter + map/sort por cliente (O(n² log n)),
  // o que travava a página com milhares de clientes.
  const count = higherIsBetter
    ? upperBound(sortedAsc, value) // #{v <= value}
    : sortedAsc.length - lowerBound(sortedAsc, value); // #{-v <= -value} = #{v >= value}
  const rank = count / sortedAsc.length;
  return Math.max(1, Math.min(5, Math.ceil(rank * 5)));
}

/** Primeiro índice com arr[i] >= x. */
function lowerBound(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Primeiro índice com arr[i] > x. */
function upperBound(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
