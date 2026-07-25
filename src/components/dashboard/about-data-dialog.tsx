"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Info } from "lucide-react";

export interface SyncCoverageRow {
  storeName: string;
  platform: string;
  lastSyncedAt: string | null;
  isActive: boolean;
}

const KPI_DEFINITIONS: { name: string; text: string }[] = [
  {
    name: "Faturamento bruto",
    text: "Soma de gross_amount de todos os pedidos não cancelados no período — inclui pedidos ainda em andamento (não só concluídos).",
  },
  {
    name: "Faturamento líquido",
    text: "Soma de net_amount só quando a plataforma informa esse valor. Mostra \"dado indisponível\" quando nenhuma fonte expõe o líquido.",
  },
  {
    name: "Ticket médio",
    text: "Faturamento só de pedidos CONCLUÍDOS dividido pela quantidade de pedidos concluídos — base diferente do card \"Faturamento bruto\" (que inclui em andamento). Ver METRICS_AUDIT.md.",
  },
  {
    name: "Total de pedidos",
    text: "Contagem de todos os pedidos do período, incluindo cancelados e em qualquer estágio.",
  },
  {
    name: "Pedidos concluídos",
    text: "Contagem de pedidos com status = concluído.",
  },
  {
    name: "Taxa de cancelamento",
    text: "Pedidos cancelados dividido pelo total de pedidos do período (todos os status).",
  },
  {
    name: "Clientes únicos",
    text: "Clientes distintos identificados no período — pedidos sem cliente vinculado não entram na contagem.",
  },
  {
    name: "Clientes novos",
    text: "Clientes cuja primeira compra em TODO o histórico sincronizado caiu dentro do período — depende do histórico completo já ter sido importado.",
  },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca sincronizado";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

export function AboutDataDialog({ coverage }: { coverage: SyncCoverageRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Info className="size-4" />
        Sobre estes dados
      </Button>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sobre estes dados</DialogTitle>
          <DialogDescription>
            Definição de cada indicador e cobertura de sincronização por loja. Auditoria
            completa em METRICS_AUDIT.md.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {KPI_DEFINITIONS.map((kpi) => (
            <div key={kpi.name}>
              <p className="text-sm font-medium">{kpi.name}</p>
              <p className="text-xs text-muted-foreground">{kpi.text}</p>
            </div>
          ))}
        </div>

        <div className="border-t pt-3">
          <p className="mb-2 text-sm font-medium">Cobertura de sincronização por loja</p>
          <div className="space-y-1.5">
            {coverage.map((row) => (
              <div key={`${row.storeName}-${row.platform}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {row.storeName} <span className="text-muted-foreground">({row.platform})</span>
                </span>
                <Badge variant={row.isActive && row.lastSyncedAt ? "outline" : "secondary"}>
                  {row.isActive ? timeAgo(row.lastSyncedAt) : "inativa"}
                </Badge>
              </div>
            ))}
            {coverage.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma integração cadastrada ainda.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
