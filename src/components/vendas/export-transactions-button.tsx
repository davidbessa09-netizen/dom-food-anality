"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportTransactionsXlsx, type ExportTransactionsParams } from "@/app/(dashboard)/vendas/actions";
import { toast } from "sonner";

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function ExportTransactionsButton({ params }: { params: ExportTransactionsParams }) {
  const [pending, setPending] = useState(false);

  async function handleExport() {
    setPending(true);
    try {
      const { base64, count, truncated } = await exportTransactionsXlsx(params);
      const blob = base64ToBlob(base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transacoes-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      if (truncated) {
        toast.warning(`Exportadas as primeiras ${count} transações — refine os filtros pra exportar o restante.`);
      } else {
        toast.success(`${count} transação(ões) exportada(s).`);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      Exportar
    </Button>
  );
}
