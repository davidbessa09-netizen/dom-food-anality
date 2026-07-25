"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SalesBarChartDatum {
  label: string;
  revenue: number;
  orders?: number;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: SalesBarChartDatum }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  const hasOrders = typeof datum.orders === "number";
  const ticket = hasOrders && datum.orders! > 0 ? datum.revenue / datum.orders! : null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      <p>Faturamento: {formatCurrency(datum.revenue)}</p>
      {hasOrders && <p>Pedidos: {datum.orders}</p>}
      {hasOrders && <p>Ticket médio: {ticket === null ? "—" : formatCurrency(ticket)}</p>}
    </div>
  );
}

export function SalesBarChart({ data, height = 260 }: { data: SalesBarChartDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${Math.round(v)}`} width={60} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
