"use client";

import { useState } from "react";
import { RevenueOrdersChart, type RevenueOrdersDatum } from "@/components/charts/revenue-orders-chart";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp } from "lucide-react";

type Granularity = "day" | "week" | "month";

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Diário" },
  { value: "week", label: "Semanal" },
  { value: "month", label: "Mensal" },
];

/** Único gráfico principal do dashboard — alterna diário/semanal/mensal
 * localmente (os três recortes já vêm pré-calculados do servidor, sem
 * round-trip por clique) e mostra a comparação com o período anterior. */
export function MainRevenueChart({
  daily,
  weekly,
  monthly,
  revenueGrowth,
  hasPriorPeriodData,
}: {
  daily: RevenueOrdersDatum[];
  weekly: RevenueOrdersDatum[];
  monthly: RevenueOrdersDatum[];
  revenueGrowth: number | null;
  hasPriorPeriodData: boolean;
}) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const data = granularity === "day" ? daily : granularity === "week" ? weekly : monthly;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {hasPriorPeriodData && revenueGrowth !== null ? (
            <Badge variant={revenueGrowth >= 0 ? "default" : "destructive"} className={revenueGrowth >= 0 ? "gap-1 bg-success" : "gap-1"}>
              {revenueGrowth >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {revenueGrowth >= 0 ? "+" : ""}
              {(revenueGrowth * 100).toFixed(1)}% vs. período anterior
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Sem período anterior pra comparar</span>
          )}
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1">
          {GRANULARITY_OPTIONS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGranularity(g.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                granularity === g.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      {data.length > 0 ? <RevenueOrdersChart data={data} /> : <p className="text-sm text-muted-foreground">Nenhum pedido no período selecionado.</p>}
    </div>
  );
}
