"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { renameCategory } from "@/app/(dashboard)/categorias/actions";

export function CategoryEditDialog({
  open,
  onOpenChange,
  categoryId,
  currentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  currentName: string;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await renameCategory(categoryId, name);
      if (result.ok) {
        toast.success("Categoria renomeada.");
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Falha ao renomear.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar categoria</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="category-name">Nome</Label>
          <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || name.trim().length < 2}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
