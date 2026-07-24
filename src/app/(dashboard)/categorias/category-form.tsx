"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { createCategory, type CategoryFormState } from "./actions";
import type { Brand } from "@/types/database";

const initialState: CategoryFormState = {};

export function CategoryForm({ brands }: { brands: Brand[] }) {
  const [state, formAction, pending] = useActionState(createCategory, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [brandId, setBrandId] = useState("");

  useEffect(() => {
    if (state.success) {
      toast.success("Categoria criada.");
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
          onValueChange={(v: unknown) => setBrandId(typeof v === "string" ? v : "")}
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
        <Label htmlFor="canonical_name">Nome da categoria</Label>
        <Input id="canonical_name" name="canonical_name" required className="w-56" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Adicionar categoria"}
      </Button>
    </form>
  );
}
