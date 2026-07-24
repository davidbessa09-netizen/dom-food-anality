"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProduct, type ProductFormState } from "./actions";
import type { Brand, Category } from "@/types/database";

const initialState: ProductFormState = {};

export function ProductForm({ brands, categories }: { brands: Brand[]; categories: Category[] }) {
  const [state, formAction, pending] = useActionState(createProduct, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [brandId, setBrandId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");

  const categoryOptions = useMemo(
    () => categories.filter((c) => c.brand_id === brandId),
    [categories, brandId]
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Produto criado.");
      formRef.current?.reset();
    }
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="brand_id">Marca</Label>
        <Select
          name="brand_id"
          required
          onValueChange={(v: unknown) => {
            setBrandId(typeof v === "string" ? v : "");
            setCategoryId("");
          }}
        >
          <SelectTrigger id="brand_id" className="w-48">
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
      </div>
      <div className="space-y-1">
        <Label htmlFor="category_id">Categoria (opcional)</Label>
        <Select
          key={brandId}
          name="category_id"
          onValueChange={(v: unknown) => setCategoryId(typeof v === "string" ? v : "")}
        >
          <SelectTrigger id="category_id" className="w-48" disabled={!brandId}>
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
      <div className="space-y-1">
        <Label htmlFor="canonical_name">Nome do produto</Label>
        <Input id="canonical_name" name="canonical_name" required className="w-56" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="current_price">Preço (R$)</Label>
        <Input id="current_price" name="current_price" type="number" step="0.01" min="0" className="w-28" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Adicionar produto"}
      </Button>
    </form>
  );
}
