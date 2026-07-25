import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StoreComparisonRow } from "./store-comparison-table";

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function DeltaVsAverage({ value, average }: { value: number | null; average: number }) {
  if (value === null || average === 0) return null;
  const delta = (value - average) / average;
  if (Math.abs(delta) < 0.001) return <span className="text-xs text-muted-foreground">na média</span>;
  const positive = delta > 0;
  return (
    <span className={positive ? "text-xs text-success" : "text-xs text-danger"}>
      {positive ? "+" : ""}
      {(delta * 100).toFixed(1)}% vs. média do grupo
    </span>
  );
}

interface MetricRow {
  label: string;
  format: (v: number | null) => string;
  value: (r: StoreComparisonRow) => number | null;
}

const METRICS: MetricRow[] = [
  { label: "Faturamento bruto", format: formatCurrency, value: (r) => r.gross },
  { label: "Ticket médio", format: formatCurrency, value: (r) => r.ticket },
  { label: "Pedidos", format: (v) => (v === null ? "—" : String(v)), value: (r) => r.orders },
  { label: "Taxa de cancelamento", format: formatPercent, value: (r) => r.cancelRate },
  { label: "Recorrência", format: formatPercent, value: (r) => r.repurchaseRate },
];

/**
 * Comparação direta lado a lado de 2 a 5 lojas selecionadas — cada métrica
 * mostra o valor absoluto e a variação percentual vs. a média do próprio
 * grupo selecionado (não vs. todas as lojas do escopo).
 */
export function StoreDirectCompare({ rows }: { rows: StoreComparisonRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Métrica</TableHead>
            {rows.map((r) => (
              <TableHead key={r.id} className="whitespace-nowrap">
                {r.name}
                <span className="block text-xs font-normal text-muted-foreground">{r.brandName}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {METRICS.map((metric) => {
            const values = rows.map((r) => metric.value(r));
            const numeric = values.filter((v): v is number => v !== null);
            const average = numeric.length > 0 ? numeric.reduce((s, v) => s + v, 0) / numeric.length : 0;
            return (
              <TableRow key={metric.label}>
                <TableCell className="font-medium">{metric.label}</TableCell>
                {rows.map((r, i) => (
                  <TableCell key={r.id} className="whitespace-nowrap">
                    <div className="tabular-nums">{metric.format(values[i])}</div>
                    <DeltaVsAverage value={values[i]} average={average} />
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
