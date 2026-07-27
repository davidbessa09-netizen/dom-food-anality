"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { OrderFeedGroup } from "@/lib/metrics/live-sales";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Drawer com os itens de um pedido — evita listar tudo dentro da linha
 * compacta do feed ("Combo Mix + 3 itens"), abre sob demanda. */
export function OrderItemsDrawer({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: OrderFeedGroup | null;
}) {
  if (!group) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Pedido #{group.orderId.slice(0, 8)}</SheetTitle>
          <SheetDescription>
            {group.storeName} · {group.channel} ·{" "}
            {new Date(group.orderedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-1.5 overflow-y-auto px-4 pb-4 text-sm">
          {group.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
              <span className="truncate font-medium">{item.productName}</span>
              <span className="whitespace-nowrap">{item.quantity} un.</span>
              <span className="tabular-nums whitespace-nowrap">{formatCurrency(item.totalPrice)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 text-sm font-medium">
            <span>Total do pedido</span>
            <span className="tabular-nums">{formatCurrency(group.totalValue)}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
