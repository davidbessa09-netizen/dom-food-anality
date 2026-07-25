"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RevenueOrdersDatum {
  label: string;
  revenue: number;
  orders: number;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: RevenueOrdersDatum }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  const ticket = datum.orders > 0 ? datum.revenue / datum.orders : null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      <p>Faturamento: {formatCurrency(datum.revenue)}</p>
      <p>Pedidos: {datum.orders}</p>
      <p>Ticket médio: {ticket === null ? "—" : formatCurrency(ticket)}</p>
    </div>
  );
}

export function RevenueOrdersChart({ data, height = 300 }: { data: RevenueOrdersDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis
          yAxisId="revenue"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => `R$${Math.round(v)}`}
          width={64}
        />
        <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 12 }} width={40} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar yAxisId="revenue" dataKey="revenue" name="Faturamento" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="orders"
          type="monotone"
          dataKey="orders"
          name="Pedidos"
          stroke="var(--chart-3)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
