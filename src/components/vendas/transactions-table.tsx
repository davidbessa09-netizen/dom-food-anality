"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface TransactionItem {
  name: string;
  quantity: number;
  isAddon: boolean;
  totalPrice: number;
}

export interface TransactionRow {
  id: string;
  orderedAt: string;
  storeName: string;
  channelLabel: string;
  statusLabel: string;
  fulfillmentLabel: string;
  paymentLabel: string;
  neighborhood: string | null;
  customerName: string | null;
  customerPhone: string | null;
  grossAmount: number;
  discountAmount: number;
  deliveryFeeAmount: number;
  netAmount: number | null;
  items: TransactionItem[];
}

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateCompact(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function itemsSummary(items: TransactionItem[]) {
  const main = items.filter((i) => !i.isAddon);
  return main.length > 0 ? main.map((i) => `${i.quantity}x ${i.name}`).join(", ") : "—";
}

function ProductsCell({ row }: { row: TransactionRow }) {
  const [expanded, setExpanded] = useState(false);
  const main = row.items.filter((i) => !i.isAddon);
  if (main.length <= 1) {
    return <span className="text-xs">{itemsSummary(row.items)}</span>;
  }
  return (
    <div className="max-w-xs">
      {expanded ? (
        <ul className="space-y-0.5 text-xs">
          {row.items.map((i, idx) => (
            <li key={idx} className={i.isAddon ? "pl-3 text-muted-foreground" : ""}>
              {i.quantity}x {i.name}
            </li>
          ))}
        </ul>
      ) : (
        <span className="truncate text-xs">{itemsSummary(row.items)}</span>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
      >
        {expanded ? (
          <>
            Recolher <ChevronUp className="size-3" />
          </>
        ) : (
          <>
            +{main.length - 1} item(ns) <ChevronDown className="size-3" />
          </>
        )}
      </button>
    </div>
  );
}

function OrderDetailDrawer({ row, open, onOpenChange }: { row: TransactionRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Detalhes do pedido</SheetTitle>
          <SheetDescription>{row ? formatDateCompact(row.orderedAt) : ""}</SheetDescription>
        </SheetHeader>
        {row && (
          <div className="space-y-4 overflow-y-auto px-4 pb-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Loja</p>
                <p className="font-medium">{row.storeName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Canal</p>
                <p className="font-medium">{row.channelLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline">{row.statusLabel}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipo</p>
                <p className="font-medium">{row.fulfillmentLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagamento</p>
                <p className="font-medium">{row.paymentLabel}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bairro</p>
                <p className="font-medium">{row.neighborhood ?? "Não informado"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-medium">{row.customerName ?? "Não identificado"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="font-medium">{row.customerPhone ?? "—"}</p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Itens</p>
              <ul className="space-y-1">
                {row.items.map((item, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-2 text-xs">
                    <span className={item.isAddon ? "pl-3 text-muted-foreground" : ""}>
                      {item.quantity}x {item.name}
                    </span>
                    <span className="tabular-nums">{formatCurrency(item.totalPrice)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1 border-t pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Faturamento bruto</span>
                <span className="tabular-nums">{formatCurrency(row.grossAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descontos</span>
                <span className="tabular-nums">{formatCurrency(row.discountAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa de entrega</span>
                <span className="tabular-nums">{formatCurrency(row.deliveryFeeAmount)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Faturamento líquido</span>
                <span className="tabular-nums">{row.netAmount === null ? "Dado indisponível" : formatCurrency(row.netAmount)}</span>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function TransactionsTable({ rows }: { rows: TransactionRow[] }) {
  const [openRow, setOpenRow] = useState<TransactionRow | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Produto(s)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatDateCompact(row.orderedAt)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{row.storeName}</TableCell>
                <TableCell className="whitespace-nowrap">{row.customerName ?? "Não identificado"}</TableCell>
                <TableCell>
                  <ProductsCell row={row} />
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline">{row.statusLabel}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{row.paymentLabel}</TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(row.grossAmount)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setOpenRow(row)}>
                    Detalhes
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                  Nenhum pedido encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <OrderDetailDrawer row={openRow} open={openRow !== null} onOpenChange={(o) => !o && setOpenRow(null)} />
    </>
  );
}
