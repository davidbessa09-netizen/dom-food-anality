"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Sensitive } from "@/components/dashboard/privacy-context";
import type { ProductSalesSummary, SaleItemEvent } from "@/lib/metrics/live-sales";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Painel lateral de detalhe do produto — fechado por padrão, aberto só ao
 * clicar numa linha da lista. Mantém só os campos pedidos: unidades,
 * pedidos, faturamento, primeira/última venda, pedidos relacionados e
 * variações reconhecidas (correspondências aprovadas). */
export function ProductDetailDrawer({
  open,
  onOpenChange,
  summary,
  events,
  variants = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ProductSalesSummary | null;
  events: SaleItemEvent[];
  variants?: { originalName: string; platform: string }[];
}) {
  if (!summary) return null;

  const relatedOrders = events
    .filter((e) => e.productName === summary.productName)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{summary.productName}</SheetTitle>
          <SheetDescription>Detalhes do produto no período filtrado.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Total de unidades</p>
              <p className="text-lg font-semibold tabular-nums">{summary.quantity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quantidade de pedidos</p>
              <p className="text-lg font-semibold tabular-nums">{summary.orders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Faturamento</p>
              <p className="text-lg font-semibold tabular-nums">
                <Sensitive value={formatCurrency(summary.revenue)} />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Primeira venda</p>
              <p className="text-sm font-medium">{formatDateTime(summary.firstSoldAt)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Última venda</p>
              <p className="text-sm font-medium">{formatDateTime(summary.lastSoldAt)}</p>
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
                <li key={i} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
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
      </SheetContent>
    </Sheet>
  );
}
