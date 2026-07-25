import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StoreDataStatus } from "@/lib/metrics/store-comparison";

export interface RankingBarRow {
  id: string;
  name: string;
  brandName: string;
  value: number;
  dataStatus: StoreDataStatus;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<StoreDataStatus, string> = {
  operacional: "Confiável",
  sem_pedidos_periodo: "Sem pedidos no período",
  integracao_incompleta: "Integração incompleta",
  loja_inativa: "Inativa",
};

/** Barras horizontais simples — sem lib de gráfico, é só um ranking visual
 * de uma métrica (faturamento). Lojas sem dado confiável ainda aparecem,
 * mas com barra tracejada e badge explicando o motivo (nunca competem pelo
 * "melhor", ver isEligibleForRanking). */
export function StoreRankingBars({ rows }: { rows: RankingBarRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const reliable = row.dataStatus === "operacional" || row.dataStatus === "sem_pedidos_periodo";
        const widthPct = Math.max(2, (row.value / max) * 100);
        return (
          <div key={row.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">
                <span className="font-medium">{row.name}</span>
                <span className="text-muted-foreground"> · {row.brandName}</span>
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                {!reliable && (
                  <Badge variant="outline" className="text-xs">
                    {STATUS_LABEL[row.dataStatus]}
                  </Badge>
                )}
                <span className="tabular-nums">{formatCurrency(row.value)}</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", reliable ? "bg-primary" : "bg-muted-foreground/30")}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma loja no escopo selecionado.</p>}
    </div>
  );
}
