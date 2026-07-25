"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Pencil, Sparkles, Trash2, FolderInput } from "lucide-react";
import { deleteCategory, listCategoryProducts, normalizeCategoryName } from "@/app/(dashboard)/categorias/actions";
import { CategoryEditDialog } from "./category-edit-dialog";
import { MoveProductsDrawer, type MoveProductOption } from "./move-products-drawer";

export interface CategoryRow {
  id: string;
  brandId: string;
  brandName: string;
  canonicalName: string;
  productCount: number;
  activeProductCount: number;
  revenue: number;
  orders: number;
  lastSoldAt: string | null;
  channels: string[];
}

const PAGE_SIZE = 25;

type SortKey = "canonicalName" | "brandName" | "productCount" | "revenue" | "orders" | "lastSoldAt";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function statusFor(row: CategoryRow): { label: string; variant: "default" | "secondary" | "outline" } {
  if (row.productCount === 0) return { label: "Vazia", variant: "outline" };
  if (row.activeProductCount === 0) return { label: "Sem produtos ativos", variant: "secondary" };
  return { label: "Ativa", variant: "default" };
}

export function CategoryTable({ rows, allCategories }: { rows: CategoryRow[]; allCategories: CategoryRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editTarget, setEditTarget] = useState<CategoryRow | null>(null);
  const [moveTarget, setMoveTarget] = useState<CategoryRow | null>(null);
  const [moveProductsList, setMoveProductsList] = useState<MoveProductOption[]>([]);
  const [loadingMove, setLoadingMove] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.canonicalName.toLowerCase().includes(term) || r.brandName.toLowerCase().includes(term));
  }, [rows, search]);

  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "canonicalName" || sortKey === "brandName") return sign * a[sortKey].localeCompare(b[sortKey]);
      if (sortKey === "lastSoldAt") return sign * ((a.lastSoldAt ?? "").localeCompare(b.lastSoldAt ?? ""));
      return sign * (a[sortKey] - b[sortKey]);
    });
  }, [filtered, sortKey, sortDir]);

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

  async function handleNormalize(row: CategoryRow) {
    const result = await normalizeCategoryName(row.id);
    if (result.ok) toast.success("Espaçamento normalizado.");
    else toast.error(result.error ?? "Falha ao normalizar.");
  }

  async function handleDelete(row: CategoryRow) {
    if (row.productCount > 0) {
      toast.error(`Essa categoria tem ${row.productCount} produto(s) vinculado(s). Mova ou mescle antes de excluir.`);
      return;
    }
    if (!window.confirm(`Excluir a categoria "${row.canonicalName}"? Essa ação não pode ser desfeita.`)) return;
    const result = await deleteCategory(row.id);
    if (result.ok) toast.success("Categoria excluída.");
    else toast.error(result.error ?? "Falha ao excluir.");
  }

  async function handleOpenMove(row: CategoryRow) {
    setMoveTarget(row);
    setLoadingMove(true);
    try {
      const products = await listCategoryProducts(row.id);
      setMoveProductsList(products);
    } finally {
      setLoadingMove(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar por categoria ou marca..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        className="max-w-sm"
      />

      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              <SortHeader label="Categoria" sortKeyValue="canonicalName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Marca" sortKeyValue="brandName" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Produtos" sortKeyValue="productCount" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Faturamento" sortKeyValue="revenue" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Pedidos" sortKeyValue="orders" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Última venda" sortKeyValue="lastSoldAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-32">Origem</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => {
              const status = statusFor(row);
              const targets = allCategories.filter((c) => c.brandId === row.brandId && c.id !== row.id);
              return (
                <TableRow key={row.id}>
                  <TableCell className="max-w-0">
                    <Tooltip>
                      <TooltipTrigger render={<span className="block truncate font-medium" />}>{row.canonicalName}</TooltipTrigger>
                      <TooltipContent side="top">{row.canonicalName}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.brandName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.productCount}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(row.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.orders}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDate(row.lastSoldAt)}</TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="truncate whitespace-nowrap text-xs">{row.channels.length > 0 ? row.channels.join(", ") : "—"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(row)}>
                          <Pencil className="size-3.5" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleNormalize(row)}>
                          <Sparkles className="size-3.5" /> Normalizar espaçamento
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenMove(row)} disabled={targets.length === 0}>
                          <FolderInput className="size-3.5" /> Mover produtos
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => handleDelete(row)}>
                          <Trash2 className="size-3.5" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "Nenhuma categoria cadastrada ainda." : "Nenhuma categoria encontrada para essa busca."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {currentPage + 1} de {totalPages} ({sorted.length} categoria(s))
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

      {editTarget && (
        <CategoryEditDialog
          open={editTarget !== null}
          onOpenChange={(o) => !o && setEditTarget(null)}
          categoryId={editTarget.id}
          currentName={editTarget.canonicalName}
        />
      )}

      {moveTarget && !loadingMove && (
        <MoveProductsDrawer
          open={moveTarget !== null}
          onOpenChange={(o) => !o && setMoveTarget(null)}
          sourceCategoryName={moveTarget.canonicalName}
          products={moveProductsList}
          targets={allCategories
            .filter((c) => c.brandId === moveTarget.brandId && c.id !== moveTarget.id)
            .map((c) => ({ id: c.id, canonicalName: c.canonicalName }))}
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
