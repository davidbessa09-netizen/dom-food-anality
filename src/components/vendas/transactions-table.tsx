"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatDateTimeBR } from "@/lib/dates/format";

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
  /** Terminal/caixa que registrou a venda — só o Bar Fácil informa isso hoje. */
  terminal: string | null;
  /** Número do pedido gerado na origem — só a Anota AI informa isso hoje. */
  orderNumber: string | null;
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
  return formatDateTimeBR(iso, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function itemsSummary(items: TransactionItem[]) {
  const main = items.filter((i) => !i.isAddon);
  return main.length > 0 ? main.map((i) => `${i.quantity}x ${i.name}`).join(", ") : "—";
}

function ProductsCell({ row }: { row: TransactionRow }) {
  const [expanded, setExpanded] = useState(false);
  const main = row.items.filter((i) => !i.isAddon);
  if (main.length <= 1) {
    return <span className="block truncate text-xs">{itemsSummary(row.items)}</span>;
  }
  return (
    <div>
      {expanded ? (
        <ul className="space-y-0.5 text-xs">
          {row.items.map((i, idx) => (
            <li key={idx} className={i.isAddon ? "pl-3 text-muted-foreground" : ""}>
              {i.quantity}x {i.name}
            </li>
          ))}
        </ul>
      ) : (
        <span className="block truncate text-xs">{itemsSummary(row.items)}</span>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-0.5 flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-primary hover:underline"
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
              {row.terminal && (
                <div>
                  <p className="text-xs text-muted-foreground">Terminal</p>
                  <p className="font-medium">{row.terminal}</p>
                </div>
              )}
              {row.orderNumber && (
                <div>
                  <p className="text-xs text-muted-foreground">Nº do pedido</p>
                  <p className="font-medium">{row.orderNumber}</p>
                </div>
              )}
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
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Data</TableHead>
              <TableHead className="w-20">Nº pedido</TableHead>
              <TableHead className="w-28">Loja</TableHead>
              <TableHead className="w-28">Cliente</TableHead>
              <TableHead>Produto(s)</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-32">Pagamento</TableHead>
              <TableHead className="w-24 text-right">Valor</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="truncate whitespace-nowrap text-xs">{formatDateCompact(row.orderedAt)}</TableCell>
                <TableCell className="truncate text-xs" title={row.orderNumber ?? "—"}>
                  {row.orderNumber ?? "—"}
                </TableCell>
                <TableCell className="truncate text-xs" title={row.storeName}>
                  {row.storeName}
                </TableCell>
                <TableCell className="truncate" title={row.customerName ?? "Não identificado"}>
                  {row.customerName ?? "Não identificado"}
                </TableCell>
                <TableCell>
                  <ProductsCell row={row} />
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className="whitespace-nowrap">
                    {row.statusLabel}
                  </Badge>
                </TableCell>
                <TableCell className="truncate text-xs" title={row.paymentLabel}>
                  {row.paymentLabel}
                </TableCell>
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
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
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
