"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, History, MoreHorizontal, ShieldOff } from "lucide-react";
import type { RfmSegment } from "@/lib/metrics/rfm";
import { AnonymizeDialog } from "./anonymize-dialog";
import { CustomerHistoryDrawer } from "./customer-history-drawer";
import { exportCustomersCsv } from "@/app/(dashboard)/clientes/actions";

export interface CustomerRow {
  id: string;
  fullName: string | null;
  phoneMasked: string | null;
  isAnonymized: boolean;
  recencyDays: number;
  frequency: number;
  monetary: number;
  segment: RfmSegment;
}

const SEGMENT_VARIANT: Record<RfmSegment, "default" | "secondary" | "destructive" | "outline"> = {
  Novos: "secondary",
  "Clientes fiéis": "default",
  "Clientes de alto valor": "default",
  "Em crescimento": "outline",
  "Em risco": "destructive",
  Inativos: "outline",
  Perdidos: "destructive",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PAGE_SIZE = 25;

type SortKey = "fullName" | "recencyDays" | "frequency" | "monetary" | "segment";

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CustomerTable({ rows, canAnonymize, canExport }: { rows: CustomerRow[]; canAnonymize: boolean; canExport: boolean }) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("monetary");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [historyTarget, setHistoryTarget] = useState<CustomerRow | null>(null);
  const [anonymizeTarget, setAnonymizeTarget] = useState<CustomerRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "fullName") return sign * (a.fullName ?? "Não identificado").localeCompare(b.fullName ?? "Não identificado");
      if (sortKey === "segment") return sign * a.segment.localeCompare(b.segment);
      return sign * ((a[sortKey] as number) - (b[sortKey] as number));
    });
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportCustomersCsv({ customerIds: sorted.map((r) => r.id) });
      if (result.ok) {
        downloadCsv(result.csv, `clientes-${new Date().toISOString().slice(0, 10)}.csv`);
        toast.success(`${result.count} cliente(s) exportado(s).`);
      } else {
        toast.error(result.error ?? "Não foi possível exportar.");
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        {canExport ? (
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="size-3.5" /> {exporting ? "Exportando..." : "Exportar"}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button variant="outline" size="sm" disabled>
                <Download className="size-3.5" /> Exportar
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Sua permissão não inclui exportar dados de clientes.</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              <SortHeader label="Cliente" sortKeyValue="fullName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <TableHead className="w-32 whitespace-nowrap">Telefone</TableHead>
              <SortHeader label="Recência" sortKeyValue="recencyDays" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Frequência" sortKeyValue="frequency" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Valor total" sortKeyValue="monetary" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Segmento" sortKeyValue="segment" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-0">
                  <Tooltip>
                    <TooltipTrigger render={<span className="block truncate" />}>{row.fullName ?? "Não identificado"}</TooltipTrigger>
                    <TooltipContent side="top">{row.fullName ?? "Não identificado"}</TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{row.phoneMasked ?? "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{row.recencyDays === 0 ? "hoje" : `${row.recencyDays}d`}</TableCell>
                <TableCell className="text-right tabular-nums">{row.frequency}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{formatCurrency(row.monetary)}</TableCell>
                <TableCell>
                  <Badge variant={SEGMENT_VARIANT[row.segment]}>{row.segment}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setHistoryTarget(row)}>
                        <History className="size-3.5" /> Ver histórico
                      </DropdownMenuItem>
                      {canAnonymize && !row.isAnonymized && (
                        <DropdownMenuItem variant="destructive" onClick={() => setAnonymizeTarget(row)}>
                          <ShieldOff className="size-3.5" /> Anonimizar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Nenhum cliente encontrado para os filtros selecionados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {currentPage + 1} de {totalPages} ({sorted.length} cliente(s))
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

      <CustomerHistoryDrawer
        open={historyTarget !== null}
        onOpenChange={(o) => !o && setHistoryTarget(null)}
        customerId={historyTarget?.id ?? null}
        fallbackName={historyTarget?.fullName ?? "Não identificado"}
      />

      {anonymizeTarget && (
        <AnonymizeDialog
          open={anonymizeTarget !== null}
          onOpenChange={(o) => !o && setAnonymizeTarget(null)}
          customerId={anonymizeTarget.id}
          customerName={anonymizeTarget.fullName ?? "Não identificado"}
          customerPhone={anonymizeTarget.phoneMasked}
        />
      )}
    </div>
  );
}

function SortHeader({
  label,
  sortKeyValue,
  align = "left",
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKeyValue: SortKey;
  align?: "left" | "right";
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <TableHead
      className={`cursor-pointer select-none whitespace-nowrap ${align === "right" ? "text-right" : ""}`}
      onClick={() => onSort(sortKeyValue)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyValue ? (
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
  );
}
