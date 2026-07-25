export interface SegmentDistributionRow {
  key: string;
  label: string;
  count: number;
  share: number;
}

/** Distribuição de clientes por segmento RFM — barras de contagem, mesmo
 * estilo visual do ShareBars (vendas/produtos) mas sem formatar como moeda. */
export function SegmentDistribution({ rows }: { rows: SegmentDistributionRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhum cliente identificado ainda.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.key} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{row.label}</span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {row.count} · {(row.share * 100).toFixed(1)}%
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
