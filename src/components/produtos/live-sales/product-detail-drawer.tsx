"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProductSalesSummary, SaleItemEvent } from "@/lib/metrics/live-sales";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function ProductDetailDrawer({
  open,
  onOpenChange,
  summary,
  events,
  onFilterPage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ProductSalesSummary | null;
  events: SaleItemEvent[];
  onFilterPage: (productName: string) => void;
}) {
  if (!summary) return null;

  const productEvents = events.filter((e) => e.productName === summary.productName);
  const byStore = new Map<string, { quantity: number; revenue: number }>();
  const byChannel = new Map<string, { quantity: number; revenue: number }>();
  const byPayment = new Map<string, number>();
  const byHour = new Map<number, number>();

  for (const e of productEvents) {
    const store = byStore.get(e.storeName) ?? { quantity: 0, revenue: 0 };
    store.quantity += e.quantity;
    store.revenue += e.totalPrice;
    byStore.set(e.storeName, store);

    const channel = byChannel.get(e.channel) ?? { quantity: 0, revenue: 0 };
    channel.quantity += e.quantity;
    channel.revenue += e.totalPrice;
    byChannel.set(e.channel, channel);

    if (e.paymentMethod) byPayment.set(e.paymentMethod, (byPayment.get(e.paymentMethod) ?? 0) + e.quantity);

    const hour = new Date(e.orderedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).slice(0, 2);
    const hourNum = Number(hour);
    byHour.set(hourNum, (byHour.get(hourNum) ?? 0) + e.quantity);
  }

  const recent = [...productEvents].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)).slice(0, 10);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{summary.productName}</SheetTitle>
          <SheetDescription>Detalhes do produto no escopo e período filtrados.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Quantidade vendida</p>
              <p className="font-medium tabular-nums">{summary.quantity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pedidos</p>
              <p className="font-medium tabular-nums">{summary.orders}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Faturamento</p>
              <p className="font-medium tabular-nums">{formatCurrency(summary.revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Preço médio</p>
              <p className="font-medium tabular-nums">{summary.avgPrice === null ? "—" : formatCurrency(summary.avgPrice)}</p>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Vendas por hora</p>
            <div className="flex flex-wrap gap-1">
              {[...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([hour, qty]) => (
                <Badge key={hour} variant="outline">
                  {String(hour).padStart(2, "0")}h: {qty}
                </Badge>
              ))}
              {byHour.size === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Vendas por loja</p>
            <ul className="space-y-1">
              {[...byStore.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([store, v]) => (
                <li key={store} className="flex items-center justify-between text-xs">
                  <span className="truncate">{store}</span>
                  <span className="tabular-nums">
                    {v.quantity} un · {formatCurrency(v.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Vendas por canal</p>
            <ul className="space-y-1">
              {[...byChannel.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([channel, v]) => (
                <li key={channel} className="flex items-center justify-between text-xs">
                  <span className="truncate">{channel}</span>
                  <span className="tabular-nums">
                    {v.quantity} un · {formatCurrency(v.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Formas de pagamento</p>
            <div className="flex flex-wrap gap-1">
              {[...byPayment.entries()].sort((a, b) => b[1] - a[1]).map(([payment, qty]) => (
                <Badge key={payment} variant="outline">
                  {payment}: {qty}
                </Badge>
              ))}
              {byPayment.size === 0 && <p className="text-xs text-muted-foreground">Sem dados.</p>}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Últimas vendas</p>
            <ul className="space-y-1.5">
              {recent.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
                  <span className="whitespace-nowrap">{formatDateTime(e.orderedAt)}</span>
                  <span className="truncate">{e.storeName}</span>
                  <span className="tabular-nums whitespace-nowrap">{formatCurrency(e.totalPrice)}</span>
                </li>
              ))}
              {recent.length === 0 && <p className="text-xs text-muted-foreground">Sem vendas no recorte.</p>}
            </ul>
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={() => onFilterPage(summary.productName)}>
            Filtrar toda a página por este produto
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
