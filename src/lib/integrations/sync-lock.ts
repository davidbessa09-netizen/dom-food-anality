import type { SupabaseClient } from "@supabase/supabase-js";

/** Nome único do lock — toda sincronização de pedidos (agendada, manual,
 * retentativa ou reconciliação) disputa o MESMO lock, porque todas mexem
 * nas mesmas linhas de orders/order_items. */
export const SYNC_LOCK_NAME = "dom-food-sync";
const LOCK_TTL_SECONDS = 240; // 4min — folga sobre o ciclo de 5min, mas expira sozinho se o processo travar.

/** Registro de controle com expiração (não advisory lock de sessão — ver
 * comentário na migration 0015: tanto a rota Node quanto a Edge Function
 * acessam o banco via conexões stateless, que não preservam uma sessão
 * Postgres entre chamadas). */
export async function tryAcquireSyncLock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  owner: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_acquire_sync_lock", {
    p_job_name: SYNC_LOCK_NAME,
    p_owner: owner,
    p_ttl_seconds: LOCK_TTL_SECONDS,
  });
  if (error) return false;
  return data === true;
}

export async function releaseSyncLock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  owner: string
): Promise<void> {
  await supabase.rpc("release_sync_lock", { p_job_name: SYNC_LOCK_NAME, p_owner: owner });
}
