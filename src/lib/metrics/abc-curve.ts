// Curva ABC de produtos por faturamento (ver METRICS_AUDIT.md) — classifica
// pela participação ACUMULADA no faturamento total do recorte, ordenado do
// maior pro menor: A até 80% acumulado, B até 95%, C o restante. Convenção
// de mercado padrão (Pareto), não é um número inventado pelo sistema.

export type AbcClass = "A" | "B" | "C";

export interface AbcInputRow {
  name: string;
  revenue: number;
  quantity: number;
}

export interface AbcRow extends AbcInputRow {
  rank: number;
  share: number; // participação individual no faturamento total (0-1)
  cumulativeShare: number; // participação acumulada até esta linha (0-1)
  classification: AbcClass;
}

export function buildAbcCurve(rows: AbcInputRow[]): AbcRow[] {
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  let cumulative = 0;

  return sorted.map((row, index) => {
    cumulative += row.revenue;
    const cumulativeShare = total > 0 ? cumulative / total : 0;
    const classification: AbcClass = cumulativeShare <= 0.8 ? "A" : cumulativeShare <= 0.95 ? "B" : "C";
    return {
      ...row,
      rank: index + 1,
      share: total > 0 ? row.revenue / total : 0,
      cumulativeShare,
      classification,
    };
  });
}

/** Participação do faturamento total concentrada nos top N produtos por
 * faturamento — usado pro card de "concentração no top 10". */
export function topNConcentration(rows: AbcInputRow[], n: number): number | null {
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  if (total === 0) return null;
  const topRevenue = [...rows]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n)
    .reduce((sum, r) => sum + r.revenue, 0);
  return topRevenue / total;
}
