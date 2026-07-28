"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProductSalesSummary } from "@/lib/metrics/live-sales";

const PAGE_SIZE = 25;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Tabela minimalista inspirada no relatório de itens do Anota AI: produto,
 * unidades, última venda e uma barrinha roxa comparando visualmente as
 * quantidades — sem cards por produto, sem carrossel, sem ordenação
 * interativa (a lista já chega ordenada do mais vendido pro menos vendido).
 */
export function LiveSalesTable({
  summaries,
  onViewDetails,
}: {
  summaries: ProductSalesSummary[];
  onViewDetails: (summary: ProductSalesSummary) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const maxQuantity = useMemo(() => Math.max(1, ...summaries.map((s) => s.quantity)), [summaries]);
  const visibleRows = summaries.slice(0, visibleCount);

  return (
    <div>
      <div className="divide-y rounded-lg border">
        <div className="flex items-center gap-3 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span className="flex-1">Produto</span>
          <span className="w-32 text-right">Unidades</span>
          <span className="w-16 text-right">Hora</span>
          <span className="w-24 text-right">Data</span>
        </div>
        {visibleRows.map((row, i) => (
          <button
            key={row.productName}
            type="button"
            onClick={() => onViewDetails(row)}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
              i % 2 === 1 ? "bg-muted/20" : "bg-card"
            }`}
          >
            <span className="flex-1 truncate font-medium">{row.productName}</span>
            <span className="flex w-32 items-center justify-end gap-2">
              <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (row.quantity / maxQuantity) * 100)}%` }} />
              </span>
              <span className="tabular-nums">{row.quantity} un.</span>
            </span>
            <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{formatTime(row.lastSoldAt)}</span>
            <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">{formatDate(row.lastSoldAt)}</span>
          </button>
        ))}
        {summaries.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhum produto vendido no período selecionado.</div>
        )}
      </div>

      {visibleCount < summaries.length && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  );
}
