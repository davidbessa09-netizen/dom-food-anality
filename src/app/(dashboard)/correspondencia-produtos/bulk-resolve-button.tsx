"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkResolveSafeMatches } from "./actions";

/**
 * Resolve em lote só os casos seguros (score alto E sem divergência de
 * categoria) — nunca cria produto novo em lote nem vincula com baixa
 * confiança. `safeCount` já vem calculado pelo servidor (mesma lógica que a
 * action usa), então o botão mostra de antemão quantos casos realmente
 * qualificam antes do usuário confirmar.
 */
export function BulkResolveButton({ pendingCount, safeCount }: { pendingCount: number; safeCount: number }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      `${safeCount} de ${pendingCount} variante(s) pendente(s) são casos seguros (alta similaridade e categoria compatível) e serão vinculadas a produtos já existentes. As demais continuam pendentes de revisão individual — nada é criado ou vinculado automaticamente em lote. Continuar?`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await bulkResolveSafeMatches();
      toast.success(`${result.linked} vinculada(s) automaticamente. ${result.skipped} continuam pendentes de revisão individual.`);
    } finally {
      setBusy(false);
    }
  }

  if (pendingCount === 0) return null;

  return (
    <Button size="sm" variant="secondary" onClick={handleClick} disabled={busy || safeCount === 0}>
      {busy ? "Processando..." : `Resolver casos seguros (${safeCount} de ${pendingCount})`}
    </Button>
  );
}
