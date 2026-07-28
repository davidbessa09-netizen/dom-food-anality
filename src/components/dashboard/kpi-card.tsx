"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/dashboard/privacy-context";

export type KpiState = "positive" | "neutral" | "critical" | "unavailable";

const STATE_ICON_WRAPPER: Record<KpiState, string> = {
  positive: "bg-success/10 text-success",
  neutral: "bg-muted text-muted-foreground",
  critical: "bg-danger/10 text-danger",
  unavailable: "bg-muted text-muted-foreground",
};

/** Traço mínimo de tendência — SVG puro, sem lib de gráfico (o card é pequeno
 * demais pra justificar o custo de um ResponsiveContainer por KPI). */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const width = 72;
  const height = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="text-muted-foreground/60" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function GrowthTag({ growthPercent }: { growthPercent: number | null | undefined }) {
  if (growthPercent === undefined) return null;
  if (growthPercent === null) {
    return <span className="text-xs text-muted-foreground">Sem período anterior pra comparar</span>;
  }
  const positive = growthPercent >= 0;
  const Icon = growthPercent === 0 ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        growthPercent === 0 ? "text-muted-foreground" : positive ? "text-success" : "text-danger"
      )}
    >
      <Icon className="size-3.5" />
      {positive && growthPercent !== 0 ? "+" : ""}
      {(growthPercent * 100).toFixed(1)}% vs. período anterior
    </span>
  );
}

export interface KpiCardProps {
  label: string;
  /** Explicação completa da métrica (tooltip) — numerador, denominador, status considerado. */
  definition: string;
  /** Linha curta sempre visível com a base de cálculo (ex.: "Pedidos concluídos"). */
  basis: string;
  value: string;
  icon: ReactNode;
  state: KpiState;
  /** undefined = comparação não se aplica a este KPI; null = não há período anterior pra comparar. */
  growthPercent?: number | null;
  trend?: number[];
  /** Texto exibido no lugar da base de cálculo quando state === "unavailable". */
  unavailableReason?: string;
  /** Marca este KPI como valor monetário sensível — mascarado quando o
   * usuário ativa "Ocultar valores" (reuniões, capturas de tela, locais
   * públicos). Contagens e percentuais nunca são sensíveis. */
  sensitive?: boolean;
}

export function KpiCard({
  label,
  definition,
  basis,
  value,
  icon,
  state,
  growthPercent,
  trend,
  unavailableReason,
  sensitive = false,
}: KpiCardProps) {
  return (
    <Card className={cn(state === "unavailable" && "border-dashed")}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{label}</span>
            <Tooltip>
              <TooltipTrigger render={<button type="button" aria-label={`Definição de ${label}`} />}>
                <Info className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-left">
                {definition}
              </TooltipContent>
            </Tooltip>
          </div>
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", STATE_ICON_WRAPPER[state])}>
            {icon}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="flex items-end justify-between gap-2">
          <span className={cn("text-2xl font-semibold tabular-nums", state === "unavailable" && "text-muted-foreground")}>
            {sensitive ? <Sensitive value={value} /> : value}
          </span>
          {trend && trend.length >= 2 && <Sparkline data={trend} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {state === "unavailable" && unavailableReason ? unavailableReason : basis}
        </p>
        <GrowthTag growthPercent={growthPercent} />
      </CardContent>
    </Card>
  );
}
