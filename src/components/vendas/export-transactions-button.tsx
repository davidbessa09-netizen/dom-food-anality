"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportTransactionsCsv, type ExportTransactionsParams } from "@/app/(dashboard)/vendas/actions";
import { toast } from "sonner";

export function ExportTransactionsButton({ params }: { params: ExportTransactionsParams }) {
  const [pending, setPending] = useState(false);

  async function handleExport() {
    setPending(true);
    try {
      const { csv, count, truncated } = await exportTransactionsCsv(params);
      const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transacoes-${new Date().toISOString().slice(0, 10)}.csv`;
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
