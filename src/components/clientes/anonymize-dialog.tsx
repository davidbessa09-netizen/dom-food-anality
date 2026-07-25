"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { anonymizeCustomer } from "@/app/(dashboard)/clientes/actions";

const CONFIRM_DELAY_MS = 2000;

/**
 * Confirmação reforçada de anonimização — mostra o cliente-alvo, explica a
 * irreversibilidade e mantém o botão de confirmação desabilitado por alguns
 * segundos (evita clique reflexo/acidental num botão destrutivo). A
 * permissão administrativa é checada de novo no servidor mesmo que este
 * diálogo só apareça pra quem já tem o menu visível.
 */
export function AnonymizeDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  customerPhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);

  // O pai só monta este diálogo quando há um alvo selecionado (ver
  // customer-table.tsx) e desmonta ao fechar, então o timer abaixo roda uma
  // vez por abertura sem precisar resetar `canConfirm` num branch síncrono.
  useEffect(() => {
    const timer = setTimeout(() => setCanConfirm(true), CONFIRM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  async function handleConfirm() {
    setBusy(true);
    try {
      const result = await anonymizeCustomer(customerId);
      if (result.ok) {
        toast.success("Cliente anonimizado.");
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Falha ao anonimizar.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-danger">
            <AlertTriangle className="size-5" /> Anonimizar cliente
          </DialogTitle>
          <DialogDescription render={<div className="space-y-2 pt-1 text-left" />}>
            <p>
              Você está prestes a anonimizar <span className="font-medium text-foreground">{customerName}</span>
              {customerPhone ? (
                <>
                  {" "}
                  (<span className="font-medium text-foreground">{customerPhone}</span>)
                </>
              ) : null}
              .
            </p>
            <p>
              Isso apaga PERMANENTEMENTE o nome e o telefone deste cliente — não pode ser desfeito. O
              histórico de pedidos continua contando para métricas agregadas, mas deixa de estar
              associado a uma pessoa identificável.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy || !canConfirm}>
            {busy ? "Anonimizando..." : canConfirm ? "Sim, anonimizar" : "Aguarde..."}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
