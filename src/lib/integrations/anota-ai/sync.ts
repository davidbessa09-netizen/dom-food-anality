import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/security/crypto";
import { persistNormalizedOrder } from "@/lib/integrations/persist-order";
import { AnotaAIAdapter } from "./adapter";

export interface SyncOneResult {
  integrationId: string;
  ok: boolean;
  ordersProcessed: number;
  error?: string;
}

/**
 * Executa uma sincronização completa de uma integração Anota AI: cria o
 * sync_job, busca pedidos via polling, grava, atualiza cursor. Recebe
 * qualquer client Supabase (com sessão de usuário — respeita RLS — ou
 * service role, usado pelo CRON). Compartilhado entre o botão manual
 * ("Sincronizar agora") e a rota /api/cron/sync.
 */
export async function syncAnotaAiIntegration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  integrationId: string,
  trigger: "manual" | "scheduled"
): Promise<SyncOneResult> {
  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, sales_channel_id, last_cursor, sales_channels(store_id, stores(brand_id, brands(organization_id)))")
    .eq("id", integrationId)
    .single();

  if (integrationError || !integration) {
    return { integrationId, ok: false, ordersProcessed: 0, error: "Integração não encontrada." };
  }

  const { data: credential } = await supabase
    .from("integration_credentials")
    .select("encrypted_value")
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (!credential?.encrypted_value) {
    return { integrationId, ok: false, ordersProcessed: 0, error: "Nenhum token cadastrado para esta integração." };
  }

  const salesChannel = integration.sales_channels as unknown as {
    store_id: string;
    stores: { brand_id: string; brands: { organization_id: string } };
  };
  const storeId = salesChannel.store_id;
  const organizationId = salesChannel.stores.brands.organization_id;

  const { data: syncJob, error: syncJobError } = await supabase
    .from("sync_jobs")
    .insert({ integration_id: integrationId, status: "running", trigger })
    .select("id")
    .single();

  if (syncJobError || !syncJob) {
    return { integrationId, ok: false, ordersProcessed: 0, error: "Não foi possível iniciar o job de sincronização." };
  }

  let token: string;
  try {
    token = decryptSecret(credential.encrypted_value);
  } catch {
    await supabase
      .from("sync_jobs")
      .update({ status: "failed", error_summary: "Falha ao decodificar credencial.", finished_at: new Date().toISOString() })
      .eq("id", syncJob.id);
    return { integrationId, ok: false, ordersProcessed: 0, error: "Falha ao decodificar a credencial salva." };
  }

  const adapter = new AnotaAIAdapter(token, { store_id: storeId, sales_channel_id: integration.sales_channel_id });

  try {
    const orders = await adapter.fetchOrders({ since: integration.last_cursor ?? undefined });

    let upserted = 0;
    let failed = 0;

    for (const order of orders) {
      const result = await persistNormalizedOrder(supabase, order, organizationId, { sync_job_id: syncJob.id });
      if (result.ok) {
        upserted++;
      } else {
        failed++;
        await supabase.from("sync_logs").insert({
          sync_job_id: syncJob.id,
          level: "error",
          message: result.message ?? "Falha ao gravar pedido",
          source_external_id: order.source_external_id,
        });
      }
    }

    const finalStatus = failed === 0 ? "success" : upserted === 0 ? "failed" : "partial_success";
    const newCursor = new Date().toISOString();

    await supabase
      .from("sync_jobs")
      .update({
        status: finalStatus,
        records_fetched: orders.length,
        records_upserted: upserted,
        records_failed: failed,
        finished_at: new Date().toISOString(),
      })
      .eq("id", syncJob.id);

    await supabase
      .from("integrations")
      .update({ last_synced_at: new Date().toISOString(), last_cursor: newCursor })
      .eq("id", integrationId);

    return { integrationId, ok: failed === 0, ordersProcessed: orders.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido na sincronização";
    await supabase
      .from("sync_jobs")
      .update({ status: "failed", error_summary: message, finished_at: new Date().toISOString() })
      .eq("id", syncJob.id);
    await supabase.from("sync_logs").insert({ sync_job_id: syncJob.id, level: "error", message });

    return { integrationId, ok: false, ordersProcessed: 0, error: message };
  }
}
