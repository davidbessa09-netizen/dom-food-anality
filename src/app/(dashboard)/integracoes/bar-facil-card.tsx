"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/dates/format";
import { syncBarFacilMenu, syncBarFacilNow, testBarFacilConnection, type BarFacilIntegrationSummary } from "./bar-facil-actions";
import { BarFacilConfigDialog } from "./bar-facil-config-dialog";
import { BarFacilMappingDialog } from "./bar-facil-mapping-dialog";

const STATUS_LABELS: Record<BarFacilIntegrationSummary["connectionStatus"], string> = {
  aguardando_credenciais: "Aguardando credenciais",
  testando: "Testando conexão",
  ativo: "Conectado",
  erro: "Erro de conexão",
};

function statusVariant(status: BarFacilIntegrationSummary["connectionStatus"]): "default" | "destructive" | "secondary" | "outline" {
  if (status === "ativo") return "default";
  if (status === "erro") return "destructive";
  return "outline";
}

export function BarFacilCard({ summary }: { summary: BarFacilIntegrationSummary }) {
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingMenu, setSyncingMenu] = useState(false);

  async function handleTestConnection() {
    setTesting(true);
    try {
      const result = await testBarFacilConnection();
      if (result.ok) toast.success(result.message ?? "Conexão validada.");
      else toast.error(result.message ?? "Falha ao testar a conexão.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const result = await syncBarFacilNow();
      if (result.ok) {
        toast.success(`Sincronizado: ${result.ordersProcessed} venda(s) em ${result.eventosProcessed} evento(s).`);
      } else {
        toast.error(result.errors[0] ?? "Falha na sincronização — veja os detalhes no evento correspondente.");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncMenu() {
    setSyncingMenu(true);
    try {
      const result = await syncBarFacilMenu();
      if (result.ok) {
        toast.success(`Catálogo sincronizado: ${result.productsProcessed} produto(s). Aprovar em "Correspondência de produtos".`);
      } else {
        toast.error(result.error ?? "Falha ao sincronizar catálogo.");
      }
    } finally {
      setSyncingMenu(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Bar Fácil</CardTitle>
            <CardDescription>PDV, cashless e gestão de vendas — barfacil.com.br</CardDescription>
          </div>
          <Badge variant={statusVariant(summary.connectionStatus)}>{STATUS_LABELS[summary.connectionStatus]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Última sincronização</dt>
            <dd>{summary.lastSyncedAt ? formatDateTimeBR(summary.lastSyncedAt) : "Nunca sincronizado"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Próxima sincronização</dt>
            <dd>—</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Lojas vinculadas</dt>
            <dd>{summary.linkedStoresCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Erro mais recente</dt>
            <dd className={summary.lastError ? "text-destructive" : ""}>{summary.lastError ?? "—"}</dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          Extração de dados via API oficial do Bar Fácil (BF Play/TicketMais) — vendas, itens e pagamentos. Recargas de
          saldo cashless (movimento-caixa) e consumo (movimento-consumo) nunca são contados como venda de produto — a
          venda em si já vem completa, com itens, pelo endpoint de vendas.
        </p>

        <div className="flex flex-wrap gap-2">
          <BarFacilConfigDialog summary={summary} />
          <Button size="sm" variant="outline" onClick={handleTestConnection} disabled={testing}>
            {testing ? "Testando..." : "Testar conexão"}
          </Button>
          <Button
            size="sm"
            onClick={handleSyncNow}
            disabled={syncing}
            className="bg-[color:var(--dom-gold)] text-white hover:bg-[color:var(--dom-gold-hover)]"
          >
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleSyncMenu} disabled={syncingMenu}>
            {syncingMenu ? "Sincronizando..." : "Sincronizar catálogo"}
          </Button>
          <BarFacilMappingDialog />
        </div>
      </CardContent>
    </Card>
  );
}
