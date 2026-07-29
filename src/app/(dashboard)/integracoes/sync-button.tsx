"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncAnotaAiNow, syncAnotaAiMenu } from "./actions";

export function SyncButton({ integrationId }: { integrationId: string }) {
  const [syncing, setSyncing] = useState(false);
  const [syncingMenu, setSyncingMenu] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncAnotaAiNow(integrationId);
      if (result.ok) {
        toast.success(`Sincronizado: ${result.ordersProcessed} pedido(s) processado(s).`);
      } else {
        toast.error(result.error ?? "Falha na sincronização — veja o histórico para detalhes.");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncMenu() {
    setSyncingMenu(true);
    try {
      const result = await syncAnotaAiMenu(integrationId);
      if (result.ok) {
        toast.success(
          `Cardápio sincronizado: ${result.productsProcessed} item(ns), ${result.categoriesProcessed} categoria(s). Aprovar em "Correspondência de produtos".`
        );
      } else {
        toast.error(result.error ?? "Falha ao sincronizar cardápio.");
      }
    } finally {
      setSyncingMenu(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={handleSync}
        disabled={syncing}
        className="bg-[color:var(--dom-gold)] text-white hover:bg-[color:var(--dom-gold-hover)]"
      >
        {syncing ? "Sincronizando..." : "Sincronizar agora"}
      </Button>
      <Button size="sm" variant="outline" onClick={handleSyncMenu} disabled={syncingMenu}>
        {syncingMenu ? "Sincronizando..." : "Sincronizar cardápio"}
      </Button>
    </div>
  );
}
