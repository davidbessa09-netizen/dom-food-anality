"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkResolveVariants } from "./actions";

export function BulkResolveButton({ pendingCount }: { pendingCount: number }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      `Isso vai processar ${pendingCount} variante(s) pendente(s): as com nome muito parecido a um produto existente (>= 85%) serão vinculadas automaticamente; as demais viram produtos novos usando o nome original. Nenhum vínculo de baixa confiança é feito silenciosamente. Continuar?`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await bulkResolveVariants();
      toast.success(
        `Concluído: ${result.linked} vinculada(s) a produtos existentes, ${result.created} criada(s) como novo produto${result.failed > 0 ? `, ${result.failed} falharam` : ""}.`
      );
    } finally {
      setBusy(false);
    }
  }

  if (pendingCount === 0) return null;

  return (
    <Button size="sm" variant="secondary" onClick={handleClick} disabled={busy}>
      {busy ? "Processando..." : `Resolver tudo automaticamente (${pendingCount})`}
    </Button>
  );
}
