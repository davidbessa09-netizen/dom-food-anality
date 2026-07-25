"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createProduct, updateProduct, type ProductFormState } from "@/app/(dashboard)/produtos/actions";
import type { Brand, Category } from "@/types/database";

const initialState: ProductFormState = {};

export interface ProductDrawerProduct {
  id: string;
  brand_id: string;
  category_id: string | null;
  canonical_name: string;
  current_price: number | null;
  is_active: boolean;
}

export function ProductDrawer({
  open,
  onOpenChange,
  brands,
  categories,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  categories: Category[];
  /** null = modo criação; preenchido = modo edição. */
  product: ProductDrawerProduct | null;
}) {
  const isEdit = product !== null;
  const action = isEdit ? updateProduct : createProduct;
  const [state, formAction, pending] = useActionState(action, initialState);
  // O pai monta um `ProductDrawer` novo (key diferente) a cada abertura pra
  // criar/editar, então o estado inicial abaixo já reflete o produto certo
  // sem precisar de um efeito pra sincronizar quando `product` muda.
  const [brandId, setBrandId] = useState(product?.brand_id ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);

  useEffect(() => {
    if (state.success) {
      toast.success(isEdit ? "Produto atualizado." : "Produto criado.");
      onOpenChange(false);
    }
    if (state.error) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const categoryOptions = useMemo(() => categories.filter((c) => c.brand_id === brandId), [categories, brandId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar produto" : "Novo produto"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Altere os dados e salve — some efeito imediatamente no catálogo." : "Cadastre um produto manualmente no catálogo."}
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {isEdit && <input type="hidden" name="id" value={product!.id} />}
          <input type="hidden" name="is_active" value={String(isActive)} />

          <div className="space-y-1.5">
            <Label htmlFor="brand_id">Marca</Label>
            {isEdit ? (
              <Input value={brands.find((b) => b.id === brandId)?.name ?? "—"} disabled />
            ) : (
              <Select
                name="brand_id"
                required
                onValueChange={(v: unknown) => {
                  setBrandId(typeof v === "string" ? v : "");
                  setCategoryId("");
                }}
              >
                <SelectTrigger id="brand_id" className="w-full">
                  <SelectValue placeholder="Selecione">
                    {() => brands.find((b) => b.id === brandId)?.name ?? "Selecione"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category_id">Categoria</Label>
            <Select
              key={brandId}
              name="category_id"
              defaultValue={categoryId || undefined}
              onValueChange={(v: unknown) => setCategoryId(typeof v === "string" ? v : "")}
            >
              <SelectTrigger id="category_id" className="w-full" disabled={!brandId}>
                <SelectValue placeholder="Sem categoria">
                  {() => categoryOptions.find((c) => c.id === categoryId)?.canonical_name ?? "Sem categoria"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.canonical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="canonical_name">Nome do produto</Label>
            <Input id="canonical_name" name="canonical_name" required defaultValue={product?.canonical_name ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="current_price">Preço (R$)</Label>
            <Input
              id="current_price"
              name="current_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product?.current_price ?? undefined}
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <span className="text-sm">{isActive ? "Ativo" : "Inativo"}</span>
            </label>
          )}

          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar produto"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
