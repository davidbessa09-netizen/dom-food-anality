"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AbcRow } from "@/lib/metrics/abc-curve";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: AbcRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 max-w-48 truncate font-medium">
        #{row.rank} {row.name}
      </p>
      <p>Faturamento: {formatCurrency(row.revenue)}</p>
      <p>Acumulado: {(row.cumulativeShare * 100).toFixed(1)}%</p>
      <p>Classe: {row.classification}</p>
    </div>
  );
}

/** Curva ABC — % acumulado de faturamento por rank de produto, com linhas de
 * referência em 80% (corte A/B) e 95% (corte B/C). */
export function AbcCurveChart({ rows, height = 260 }: { rows: AbcRow[]; height?: number }) {
  const data = rows.map((r) => ({ ...r, cumulativePct: r.cumulativeShare * 100 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis dataKey="rank" tick={{ fontSize: 12 }} label={{ value: "Rank do produto", position: "insideBottom", offset: -4, fontSize: 11 }} />
        <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} tickFormatter={(v) => `${Math.round(v)}%`} width={44} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={80} stroke="var(--chart-6)" strokeDasharray="4 4" />
        <ReferenceLine y={95} stroke="var(--chart-4)" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="cumulativePct" stroke="var(--primary)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
