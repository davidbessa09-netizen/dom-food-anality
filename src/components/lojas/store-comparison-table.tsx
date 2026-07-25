"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeBR } from "@/lib/dates/format";
import type { StoreDataStatus } from "@/lib/metrics/store-comparison";

export interface StoreComparisonRow {
  id: string;
  name: string;
  brandName: string;
  city: string | null;
  channels: string[];
  dataStatus: StoreDataStatus;
  lastSyncedAt: string | null;
  gross: number;
  grossGrowth: number | null;
  net: number | null;
  orders: number;
  completed: number;
  ticket: number | null;
  cancelRate: number | null;
  uniqueCustomers: number;
  repurchaseRate: number | null;
}

const STATUS_LABEL: Record<StoreDataStatus, string> = {
  operacional: "Confiável",
  sem_pedidos_periodo: "Sem pedidos no período",
  integracao_incompleta: "Integração incompleta",
  loja_inativa: "Inativa",
};

const STATUS_VARIANT: Record<StoreDataStatus, "default" | "secondary" | "destructive" | "outline"> = {
  operacional: "default",
  sem_pedidos_periodo: "outline",
  integracao_incompleta: "destructive",
  loja_inativa: "secondary",
};

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

interface ColumnDef {
  key: string;
  label: string;
  align: "left" | "right";
  defaultVisible: boolean;
  sortValue: (row: StoreComparisonRow) => number | string;
  render: (row: StoreComparisonRow) => React.ReactNode;
  csvValue: (row: StoreComparisonRow) => string;
}

const COLUMNS: ColumnDef[] = [
  {
    key: "name",
    label: "Loja",
    align: "left",
    defaultVisible: true,
    sortValue: (r) => r.name,
    csvValue: (r) => r.name,
    render: (r) => (
      <Tooltip>
        <TooltipTrigger render={<span className="block max-w-[160px] truncate font-medium" />}>{r.name}</TooltipTrigger>
        <TooltipContent side="top">{r.name}</TooltipContent>
      </Tooltip>
    ),
  },
  {
    key: "brand",
    label: "Marca",
    align: "left",
    defaultVisible: true,
    sortValue: (r) => r.brandName,
    csvValue: (r) => r.brandName,
    render: (r) => <span className="truncate">{r.brandName}</span>,
  },
  {
    key: "city",
    label: "Cidade",
    align: "left",
    defaultVisible: true,
    sortValue: (r) => r.city ?? "",
    csvValue: (r) => r.city ?? "",
    render: (r) => r.city ?? "—",
  },
  {
    key: "channels",
    label: "Canais",
    align: "left",
    defaultVisible: false,
    sortValue: (r) => r.channels.join(","),
    csvValue: (r) => r.channels.join(" / "),
    render: (r) => (r.channels.length > 0 ? r.channels.join(", ") : "—"),
  },
  {
    key: "dataStatus",
    label: "Confiabilidade",
    align: "left",
    defaultVisible: true,
    sortValue: (r) => r.dataStatus,
    csvValue: (r) => STATUS_LABEL[r.dataStatus],
    render: (r) => <Badge variant={STATUS_VARIANT[r.dataStatus]}>{STATUS_LABEL[r.dataStatus]}</Badge>,
  },
  {
    key: "lastSyncedAt",
    label: "Última sincronização",
    align: "left",
    defaultVisible: true,
    sortValue: (r) => r.lastSyncedAt ?? "",
    csvValue: (r) => (r.lastSyncedAt ? formatDateTimeBR(r.lastSyncedAt) : "nunca"),
    render: (r) => <span className="whitespace-nowrap text-xs">{timeAgo(r.lastSyncedAt)}</span>,
  },
  {
    key: "gross",
    label: "Faturamento bruto",
    align: "right",
    defaultVisible: true,
    sortValue: (r) => r.gross,
    csvValue: (r) => String(r.gross),
    render: (r) => <span className="tabular-nums whitespace-nowrap">{formatCurrency(r.gross)}</span>,
  },
  {
    key: "grossGrowth",
    label: "Crescimento",
    align: "right",
    defaultVisible: true,
    sortValue: (r) => r.grossGrowth ?? -Infinity,
    csvValue: (r) => (r.grossGrowth === null ? "" : `${(r.grossGrowth * 100).toFixed(1)}%`),
    render: (r) =>
      r.grossGrowth === null ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        <Badge variant={r.grossGrowth >= 0 ? "default" : "destructive"} className={r.grossGrowth >= 0 ? "bg-success" : undefined}>
          {r.grossGrowth >= 0 ? "+" : ""}
          {(r.grossGrowth * 100).toFixed(1)}%
        </Badge>
      ),
  },
  {
    key: "net",
    label: "Faturamento líquido",
    align: "right",
    defaultVisible: false,
    sortValue: (r) => r.net ?? -Infinity,
    csvValue: (r) => (r.net === null ? "" : String(r.net)),
    render: (r) => <span className="tabular-nums whitespace-nowrap">{formatCurrency(r.net)}</span>,
  },
  {
    key: "orders",
    label: "Pedidos",
    align: "right",
    defaultVisible: true,
    sortValue: (r) => r.orders,
    csvValue: (r) => String(r.orders),
    render: (r) => r.orders,
  },
  {
    key: "completed",
    label: "Concluídos",
    align: "right",
    defaultVisible: false,
    sortValue: (r) => r.completed,
    csvValue: (r) => String(r.completed),
    render: (r) => r.completed,
  },
  {
    key: "ticket",
    label: "Ticket médio",
    align: "right",
    defaultVisible: true,
    sortValue: (r) => r.ticket ?? -Infinity,
    csvValue: (r) => (r.ticket === null ? "" : String(r.ticket)),
    render: (r) => <span className="tabular-nums whitespace-nowrap">{formatCurrency(r.ticket)}</span>,
  },
  {
    key: "cancelRate",
    label: "Cancelamento",
    align: "right",
    defaultVisible: true,
    sortValue: (r) => r.cancelRate ?? -Infinity,
    csvValue: (r) => (r.cancelRate === null ? "" : `${(r.cancelRate * 100).toFixed(1)}%`),
    render: (r) => formatPercent(r.cancelRate),
  },
  {
    key: "uniqueCustomers",
    label: "Clientes únicos",
    align: "right",
    defaultVisible: false,
    sortValue: (r) => r.uniqueCustomers,
    csvValue: (r) => String(r.uniqueCustomers),
    render: (r) => r.uniqueCustomers,
  },
  {
    key: "repurchaseRate",
    label: "Recorrência",
    align: "right",
    defaultVisible: true,
    sortValue: (r) => r.repurchaseRate ?? -Infinity,
    csvValue: (r) => (r.repurchaseRate === null ? "" : `${(r.repurchaseRate * 100).toFixed(1)}%`),
    render: (r) => formatPercent(r.repurchaseRate),
  },
];

const PAGE_SIZE = 15;

function downloadCsv(rows: StoreComparisonRow[], columns: ColumnDef[]) {
  const header = columns.map((c) => c.label).join(";");
  const lines = rows.map((row) => columns.map((c) => `"${c.csvValue(row).replace(/"/g, '""')}"`).join(";"));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comparacao-lojas-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function StoreComparisonTable({ rows }: { rows: StoreComparisonRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("gross");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(
    new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );

  const visibleColumns = COLUMNS.filter((c) => visibleKeys.has(c.key));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.brandName.toLowerCase().includes(term) ||
        (r.city ?? "").toLowerCase().includes(term)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sortKey);
    if (!column) return filtered;
    const sign = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = column.sortValue(a);
      const bv = column.sortValue(b);
      if (typeof av === "string" || typeof bv === "string") return sign * String(av).localeCompare(String(bv));
      return sign * ((av as number) - (bv as number));
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const rowPad = density === "compact" ? "py-1" : "py-2.5";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Buscar por loja, marca ou cidade..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"))}
          >
            <Rows3 className="size-3.5" />
            {density === "comfortable" ? "Confortável" : "Compacta"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Columns3 className="size-3.5" />
              Colunas
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visibleKeys.has(c.key)}
                  onCheckedChange={(checked) => {
                    setVisibleKeys((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(c.key);
                      else next.delete(c.key);
                      return next;
                    });
                  }}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(sorted, visibleColumns)}>
            <Download className="size-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {visibleColumns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn("cursor-pointer select-none whitespace-nowrap", c.align === "right" && "text-right")}
                  onClick={() => toggleSort(c.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3.5" />
                      ) : (
                        <ArrowDown className="size-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 text-muted-foreground/50" />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow key={row.id}>
                {visibleColumns.map((c) => (
                  <TableCell key={c.key} className={cn(rowPad, c.align === "right" && "text-right")}>
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "Nenhuma loja no escopo selecionado." : "Nenhuma loja encontrada para essa busca."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {currentPage + 1} de {totalPages} ({sorted.length} loja(s))
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={currentPage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
