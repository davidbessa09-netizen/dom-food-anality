"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moveProducts } from "@/app/(dashboard)/categorias/actions";

export interface MoveProductOption {
  id: string;
  canonicalName: string;
}

export interface MoveTargetOption {
  id: string;
  canonicalName: string;
}

export function MoveProductsDrawer({
  open,
  onOpenChange,
  sourceCategoryName,
  products,
  targets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceCategoryName: string;
  products: MoveProductOption[];
  targets: MoveTargetOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(products.map((p) => p.id)));
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function handleMove() {
    if (!targetId) {
      toast.error("Escolha uma categoria de destino.");
      return;
    }
    setSaving(true);
    try {
      const result = await moveProducts([...selected], targetId);
      if (result.ok) {
        toast.success(`${selected.size} produto(s) movido(s).`);
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Falha ao mover produtos.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Mover produtos</SheetTitle>
          <SheetDescription>De &quot;{sourceCategoryName}&quot; para outra categoria da mesma marca.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Categoria de destino</label>
            <Select value={targetId} onValueChange={(v: unknown) => setTargetId(typeof v === "string" ? v : "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione">
                  {() => targets.find((t) => t.id === targetId)?.canonicalName ?? "Selecione"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {targets.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.canonicalName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">{selected.size} de {products.length} produto(s) selecionado(s)</p>
            <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {products.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(checked) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      });
                    }}
                  />
                  <span className="truncate">{p.canonicalName}</span>
                </label>
              ))}
              {products.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nenhum produto nesta categoria.</p>}
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button onClick={handleMove} disabled={saving || selected.size === 0 || !targetId}>
            {saving ? "Movendo..." : `Mover ${selected.size} produto(s)`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
