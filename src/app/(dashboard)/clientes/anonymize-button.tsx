"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { anonymizeCustomer } from "./actions";

export function AnonymizeButton({ customerId }: { customerId: string }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      "Isso apaga permanentemente o nome e o telefone deste cliente, sem volta. O histórico de pedidos continua contando para métricas agregadas, mas deixa de estar associado a uma pessoa identificável. Continuar?"
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await anonymizeCustomer(customerId);
      if (result.ok) toast.success("Cliente anonimizado.");
      else toast.error(result.error ?? "Falha ao anonimizar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={busy}>
      {busy ? "..." : "Anonimizar"}
    </Button>
  );
}
