export interface ShareBarRow {
  key: string;
  label: string;
  revenue: number;
  share: number;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Barras de participação (canal, forma de pagamento) — mesmo padrão visual
 * do ranking de lojas, reduzido pra caber em cards menores. */
export function ShareBars({ rows, emptyLabel }: { rows: ShareBarRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.key} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {formatCurrency(row.revenue)} · {(row.share * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, row.share * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
