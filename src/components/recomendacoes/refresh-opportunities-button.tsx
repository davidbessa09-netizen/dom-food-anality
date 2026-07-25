"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { refreshOpportunities } from "@/app/(dashboard)/recomendacoes/actions";

export function RefreshOpportunitiesButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const result = await refreshOpportunities();
      if (result.ok) toast.success("Oportunidades atualizadas.");
      else toast.error(result.error ?? "Falha ao atualizar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={pending}>
      <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} /> {pending ? "Atualizando..." : "Atualizar"}
    </Button>
  );
}
