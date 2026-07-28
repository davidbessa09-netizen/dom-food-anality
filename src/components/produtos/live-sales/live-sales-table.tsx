"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sensitive } from "@/components/dashboard/privacy-context";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ProductSalesSummary, SaleItemEvent } from "@/lib/metrics/live-sales";

const PAGE_SIZE = 25;

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Bloco de detalhe do produto — expande INLINE logo abaixo da linha
 * clicada, nunca em gaveta/drawer lateral. */
function ProductDetailRow({
  summary,
  events,
  variants,
}: {
  summary: ProductSalesSummary;
  events: SaleItemEvent[];
  variants: { originalName: string; platform: string }[];
}) {
  const relatedOrders = events
    .filter((e) => e.productName === summary.productName)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));

  return (
    <div className="space-y-4 border-t bg-muted/20 px-4 py-4 text-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Total de unidades</p>
          <p className="text-base font-semibold tabular-nums">{summary.quantity}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pedidos</p>
          <p className="text-base font-semibold tabular-nums">{summary.orders}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Faturamento</p>
          <p className="text-base font-semibold tabular-nums">
            <Sensitive value={formatCurrency(summary.revenue)} />
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Primeira venda</p>
          <p className="text-sm font-medium">{formatDateTime(summary.firstSoldAt)}</p>
        </div>
      </div>

      {variants.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Variações reconhecidas</p>
          <div className="flex flex-wrap gap-1">
            {variants.map((v, i) => (
              <Badge key={i} variant="outline" title={v.originalName}>
                {v.platform}: {v.originalName}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Pedidos relacionados</p>
        <ul className="space-y-1.5">
          {relatedOrders.slice(0, 30).map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5 text-xs">
              <span className="whitespace-nowrap">{formatDateTime(e.orderedAt)}</span>
              <span className="truncate">{e.storeName}</span>
              <span className="tabular-nums whitespace-nowrap">
                <Sensitive value={formatCurrency(e.totalPrice)} />
              </span>
            </li>
          ))}
          {relatedOrders.length === 0 && <p className="text-xs text-muted-foreground">Sem pedidos no recorte.</p>}
        </ul>
      </div>
    </div>
  );
}

/** Tabela minimalista inspirada no relatório de itens do Anota AI: produto,
 * unidades, última venda e uma barrinha roxa comparando visualmente as
 * quantidades — sem cards por produto, sem carrossel, sem ordenação
 * interativa (a lista já chega ordenada do mais vendido pro menos vendido).
 * Clicar numa linha expande o detalhe logo abaixo dela, nunca em gaveta. */
export function LiveSalesTable({
  summaries,
  events,
  variantsByProduct,
}: {
  summaries: ProductSalesSummary[];
  events: SaleItemEvent[];
  variantsByProduct: Record<string, { originalName: string; platform: string }[]>;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);

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
          <span className="w-6" />
        </div>
        {visibleRows.map((row, i) => {
          const isExpanded = expanded === row.productName;
          return (
            <div key={row.productName}>
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : row.productName)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                  isExpanded ? "bg-muted" : i % 2 === 1 ? "bg-muted/20" : "bg-card"
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
                <span className="w-6 shrink-0 text-muted-foreground">
                  {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </span>
              </button>
              {isExpanded && (
                <ProductDetailRow summary={row} events={events} variants={variantsByProduct[row.productName] ?? []} />
              )}
            </div>
          );
        })}
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
