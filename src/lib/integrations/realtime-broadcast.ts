import type { SupabaseClient } from "@supabase/supabase-js";

export const SYNC_BROADCAST_CHANNEL = "products-sync";
export const SYNC_BROADCAST_EVENT = "products_sync_completed";

export interface SyncCompletedPayload {
  storeIds: string[];
  ordersProcessed: number;
  syncedAt: string;
}

/**
 * Avisa telas conectadas que uma sincronização terminou, via Supabase
 * Realtime Broadcast — não depende de nenhuma linha específica mudar
 * (diferente de `postgres_changes`), então dispara mesmo quando o resultado
 * é "0 pedidos novos" (o que ainda é informação útil: "acabei de checar e
 * não tinha nada novo"). Quem escuta decide se o evento é relevante pro seu
 * filtro atual (loja/período/produto) — este helper só emite o fato.
 *
 * Nunca lança: broadcast é um "nice to have" pra UI reagir mais rápido, não
 * pode derrubar a sincronização em si se o realtime estiver instável.
 */
export async function broadcastSyncCompleted(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  payload: SyncCompletedPayload
): Promise<void> {
  try {
    const channel = supabase.channel(SYNC_BROADCAST_CHANNEL);
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    await channel.send({ type: "broadcast", event: SYNC_BROADCAST_EVENT, payload });
    await supabase.removeChannel(channel);
  } catch {
    // silencioso de propósito — ver comentário acima.
  }
}
