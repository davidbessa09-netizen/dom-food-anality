"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getImportErrors, undoImport, type ImportErrorRow } from "./actions";

export function ImportRowActions({
  importId,
  canUndo,
  hasErrors,
}: {
  importId: string;
  canUndo: boolean;
  hasErrors: boolean;
}) {
  const [errors, setErrors] = useState<ImportErrorRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState(false);

  async function handleShowErrors() {
    if (errors) {
      setErrors(null);
      return;
    }
    setLoading(true);
    try {
      const rows = await getImportErrors(importId);
      setErrors(rows);
    } finally {
      setLoading(false);
    }
  }

  async function handleUndo() {
    setUndoing(true);
    try {
      const res = await undoImport(importId);
      if (res.ok) {
        toast.success("Importação desfeita.");
      } else {
        toast.error(res.error ?? "Não foi possível desfazer.");
      }
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        {hasErrors && (
          <Button size="sm" variant="outline" onClick={handleShowErrors} disabled={loading}>
            {errors ? "Ocultar erros" : "Ver erros"}
          </Button>
        )}
        {canUndo && (
          <Button size="sm" variant="destructive" onClick={handleUndo} disabled={undoing}>
            {undoing ? "Desfazendo..." : "Desfazer"}
          </Button>
        )}
      </div>
      {errors && (
        <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-xs">
          {errors.length === 0 && <p className="text-muted-foreground">Sem detalhes de erro.</p>}
          {errors.map((e, i) => (
            <p key={i}>
              Linha {e.row_number}
              {e.column_name ? ` (${e.column_name})` : ""}: {e.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
