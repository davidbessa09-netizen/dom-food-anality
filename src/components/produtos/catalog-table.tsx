"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { toggleProductActive, deleteProduct } from "@/app/(dashboard)/produtos/actions";
import { ProductDrawer, type ProductDrawerProduct } from "./product-drawer";
import type { Brand, Category } from "@/types/database";

export interface CatalogRow {
  id: string;
  brandId: string;
  categoryId: string | null;
  canonicalName: string;
  brandName: string;
  categoryName: string;
  price: number | null;
  isActive: boolean;
  origin: string;
  channels: string[];
  lastSoldAt: string | null;
}

const PAGE_SIZE = 25;

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string | null) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function CatalogTable({ products, brands, categories }: { products: CatalogRow[]; brands: Brand[]; categories: Category[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editingProduct, setEditingProduct] = useState<ProductDrawerProduct | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.canonicalName.toLowerCase().includes(term) ||
        p.brandName.toLowerCase().includes(term) ||
        p.categoryName.toLowerCase().includes(term)
    );
  }, [products, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function openEdit(row: CatalogRow) {
    setCreating(false);
    setEditingProduct({
      id: row.id,
      brand_id: row.brandId,
      category_id: row.categoryId,
      canonical_name: row.canonicalName,
      current_price: row.price,
      is_active: row.isActive,
    });
    setDrawerOpen(true);
  }

  function openCreate() {
    setCreating(true);
    setEditingProduct(null);
    setDrawerOpen(true);
  }

  async function handleToggleActive(row: CatalogRow) {
    const result = await toggleProductActive(row.id, !row.isActive);
    if (result.ok) toast.success(row.isActive ? "Produto desativado." : "Produto ativado.");
    else toast.error("Não foi possível atualizar o produto.");
  }

  async function handleDelete(row: CatalogRow) {
    if (!window.confirm(`Excluir "${row.canonicalName}" permanentemente? Essa ação não pode ser desfeita.`)) return;
    const result = await deleteProduct(row.id);
    if (result.ok) toast.success("Produto excluído.");
    else toast.error("Não foi possível excluir o produto.");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Buscar por produto, marca ou categoria..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="max-w-sm"
        />
        <Button size="sm" onClick={openCreate}>
          Novo produto
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Última venda</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-[200px] font-medium">
                  <Tooltip>
                    <TooltipTrigger render={<span className="block truncate" />}>{p.canonicalName}</TooltipTrigger>
                    <TooltipContent side="top">{p.canonicalName}</TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="whitespace-nowrap">{p.brandName}</TableCell>
                <TableCell className="whitespace-nowrap">{p.categoryName}</TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? "default" : "secondary"}>{p.isActive ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">{formatCurrency(p.price)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{p.origin}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{formatDate(p.lastSoldAt)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(p)}>
                        <Pencil className="size-3.5" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(p)}>
                        <Power className="size-3.5" /> {p.isActive ? "Desativar" : "Ativar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(p)}>
                        <Trash2 className="size-3.5" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                  {products.length === 0 ? "Nenhum produto cadastrado ainda." : "Nenhum produto encontrado para essa busca."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {currentPage + 1} de {totalPages} ({filtered.length} produto(s))
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

      <ProductDrawer
        key={creating ? "new" : (editingProduct?.id ?? "closed")}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        brands={brands}
        categories={categories}
        product={creating ? null : editingProduct}
      />
    </div>
  );
}
