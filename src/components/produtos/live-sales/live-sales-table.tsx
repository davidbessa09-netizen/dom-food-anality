"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from "lucide-react";
import type { ProductSalesSummary } from "@/lib/metrics/live-sales";

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type SortKey = "productName" | "quantity" | "orders" | "revenue" | "avgPrice" | "lastSoldAt";

interface ColumnDef {
  key: string;
  label: string;
  align: "left" | "right";
  defaultVisible: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "productName", label: "Produto", align: "left", defaultVisible: true },
  { key: "categoryName", label: "Categoria", align: "left", defaultVisible: false },
  { key: "quantity", label: "Qtd. vendida", align: "right", defaultVisible: true },
  { key: "orders", label: "Pedidos", align: "right", defaultVisible: true },
  { key: "revenue", label: "Faturamento", align: "right", defaultVisible: true },
  { key: "avgPrice", label: "Preço médio", align: "right", defaultVisible: true },
  { key: "lastSoldAt", label: "Última venda", align: "left", defaultVisible: true },
  { key: "topStoreName", label: "Loja principal", align: "left", defaultVisible: false },
  { key: "topChannel", label: "Canal principal", align: "left", defaultVisible: false },
  { key: "growth", label: "Variação", align: "right", defaultVisible: true },
];

const PAGE_SIZES = [10, 25, 50, 100];

export function LiveSalesTable({
  summaries,
  previousSummaries,
  categoryByProductName,
  onViewDetails,
}: {
  summaries: ProductSalesSummary[];
  previousSummaries: ProductSalesSummary[];
  categoryByProductName: Map<string, string>;
  onViewDetails: (summary: ProductSalesSummary) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)));

  const previousByName = useMemo(() => new Map(previousSummaries.map((p) => [p.productName, p.quantity])), [previousSummaries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return summaries;
    return summaries.filter((s) => s.productName.toLowerCase().includes(term));
  }, [summaries, search]);

  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "productName") return sign * a.productName.localeCompare(b.productName);
      if (sortKey === "lastSoldAt") return sign * a.lastSoldAt.localeCompare(b.lastSoldAt);
      return sign * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0));
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function growthFor(name: string, quantity: number): number | null {
    const previous = previousByName.get(name);
    if (previous === undefined || previous <= 0) return null;
    return (quantity - previous) / previous;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input placeholder="Buscar produto..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="max-w-sm" />
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="w-28">
              <SelectValue>{() => `${pageSize} / página`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Columns3 className="size-3.5" /> Colunas
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
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-md border">
        <Table className="w-full table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {visibleKeys.has("productName") && (
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("productName")}>
                  <span className="inline-flex items-center gap-1">
                    Produto <SortIcon active={sortKey === "productName"} dir={sortDir} />
                  </span>
                </TableHead>
              )}
              {visibleKeys.has("categoryName") && <TableHead>Categoria</TableHead>}
              {visibleKeys.has("quantity") && (
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("quantity")}>
                  <span className="inline-flex items-center gap-1">
                    Qtd. vendida <SortIcon active={sortKey === "quantity"} dir={sortDir} />
                  </span>
                </TableHead>
              )}
              {visibleKeys.has("orders") && (
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("orders")}>
                  <span className="inline-flex items-center gap-1">
                    Pedidos <SortIcon active={sortKey === "orders"} dir={sortDir} />
                  </span>
                </TableHead>
              )}
              {visibleKeys.has("revenue") && (
                <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("revenue")}>
                  <span className="inline-flex items-center gap-1">
                    Faturamento <SortIcon active={sortKey === "revenue"} dir={sortDir} />
                  </span>
                </TableHead>
              )}
              {visibleKeys.has("avgPrice") && <TableHead className="text-right">Preço médio</TableHead>}
              {visibleKeys.has("lastSoldAt") && <TableHead>Última venda</TableHead>}
              {visibleKeys.has("topStoreName") && <TableHead>Loja principal</TableHead>}
              {visibleKeys.has("topChannel") && <TableHead>Canal principal</TableHead>}
              {visibleKeys.has("growth") && (
                <TableHead className="text-right">
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help" />}>Variação</TooltipTrigger>
                    <TooltipContent side="top">Vs. o período anterior de mesma duração — vazio quando não há histórico anterior.</TooltipContent>
                  </Tooltip>
                </TableHead>
              )}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => {
              const growth = growthFor(row.productName, row.quantity);
              return (
                <TableRow key={row.productName}>
                  {visibleKeys.has("productName") && (
                    <TableCell className="max-w-0">
                      <Tooltip>
                        <TooltipTrigger render={<span className="block truncate font-medium" />}>{row.productName}</TooltipTrigger>
                        <TooltipContent side="top">{row.productName}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  )}
                  {visibleKeys.has("categoryName") && <TableCell className="text-xs">{categoryByProductName.get(row.productName) ?? "—"}</TableCell>}
                  {visibleKeys.has("quantity") && <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>}
                  {visibleKeys.has("orders") && <TableCell className="text-right tabular-nums">{row.orders}</TableCell>}
                  {visibleKeys.has("revenue") && <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(row.revenue)}</TableCell>}
                  {visibleKeys.has("avgPrice") && <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(row.avgPrice)}</TableCell>}
                  {visibleKeys.has("lastSoldAt") && <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.lastSoldAt)}</TableCell>}
                  {visibleKeys.has("topStoreName") && <TableCell className="truncate text-xs">{row.topStoreName ?? "—"}</TableCell>}
                  {visibleKeys.has("topChannel") && <TableCell className="truncate text-xs">{row.topChannel ?? "—"}</TableCell>}
                  {visibleKeys.has("growth") && (
                    <TableCell className="text-right">
                      {growth === null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <span className={growth >= 0 ? "text-xs font-medium text-success" : "text-xs font-medium text-danger"}>
                          {growth >= 0 ? "+" : ""}
                          {(growth * 100).toFixed(1)}%
                        </span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => onViewDetails(row)}>
                      Ver detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleKeys.size + 1} className="text-center text-sm text-muted-foreground">
                  {summaries.length === 0 ? "Nenhum produto vendido no recorte selecionado." : "Nenhum produto encontrado para essa busca."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {currentPage + 1} de {totalPages} ({sorted.length} produto(s))
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

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="size-3 text-muted-foreground/50" />;
  return dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}
