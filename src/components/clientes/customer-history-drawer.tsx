"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { getCustomerHistory, type CustomerHistoryOrder } from "@/app/(dashboard)/clientes/actions";
import { formatDateBR } from "@/lib/dates/format";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return formatDateBR(iso);
}

export function CustomerHistoryDrawer({
  open,
  onOpenChange,
  customerId,
  fallbackName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  fallbackName: string;
}) {
  const [data, setData] = useState<{
    customer: { fullName: string | null; phoneMasked: string | null; isAnonymized: boolean; firstSeenAt: string | null };
    orders: CustomerHistoryOrder[];
    totalOrders: number;
    totalRevenue: number;
  } | null>(null);
  // Deriva o "carregando" do próprio estado (sem um setState de loading
  // separado): enquanto o drawer está aberto e ainda não chegou resposta
  // pra este cliente, está carregando.
  const loading = open && customerId !== null && data === null;

  useEffect(() => {
    if (!open || !customerId) return;
    let cancelled = false;
    getCustomerHistory(customerId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.customer && result.orders) {
        setData({
          customer: result.customer,
          orders: result.orders,
          totalOrders: result.totalOrders ?? 0,
          totalRevenue: result.totalRevenue ?? 0,
        });
      }
    });
    return () => {
      cancelled = true;
      setData(null);
    };
  }, [open, customerId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{data?.customer.fullName ?? fallbackName}</SheetTitle>
          <SheetDescription>
            {data?.customer.phoneMasked ?? "—"} · Histórico agregado de pedidos identificados.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 text-sm">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando histórico...
            </div>
          )}
          {!loading && data && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente desde</p>
                  <p className="font-medium">{formatDate(data.customer.firstSeenAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de pedidos</p>
                  <p className="font-medium">{data.totalOrders}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Faturamento total</p>
                  <p className="font-medium tabular-nums">{formatCurrency(data.totalRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status LGPD</p>
                  <Badge variant={data.customer.isAnonymized ? "secondary" : "outline"}>
                    {data.customer.isAnonymized ? "Anonimizado" : "Identificado"}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Pedidos mais recentes ({data.orders.length} de {data.totalOrders})
                </p>
                <ul className="space-y-1.5">
                  {data.orders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
                      <span className="whitespace-nowrap">{formatDate(o.orderedAt)}</span>
                      <span className="truncate">{o.storeName}</span>
                      <Badge variant="outline" className="whitespace-nowrap">
                        {o.status}
                      </Badge>
                      <span className="whitespace-nowrap tabular-nums">{formatCurrency(o.grossAmount)}</span>
                    </li>
                  ))}
                  {data.orders.length === 0 && <p className="text-xs text-muted-foreground">Nenhum pedido encontrado.</p>}
                </ul>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
