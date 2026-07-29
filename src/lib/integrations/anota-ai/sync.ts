import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/security/crypto";
import { persistNormalizedOrder } from "@/lib/integrations/persist-order";
import { computeSyncSince } from "@/lib/integrations/sync-window";
import { withRetry } from "@/lib/integrations/retry";
import { broadcastSyncCompleted } from "@/lib/integrations/realtime-broadcast";
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
 * ("Sincronizar agora"), a rota /api/cron/sync (agendada a cada 5 minutos
 * via Supabase Cron) e a reconciliação noturna.
 *
 * `sinceOverride` força a data de início da busca (usado pela
 * reconciliação, que ignora a sobreposição normal de 10min e revê os
 * últimos 7 dias) — quando ausente, usa [[computeSyncSince]] (sobreposição
 * de 10min antes do último SUCESSO, nunca em cima dele, pra não perder
 * pedido atrasado/alterado).
 */
export async function syncAnotaAiIntegration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  integrationId: string,
  trigger: "manual" | "scheduled" | "retry" | "reconciliation",
  sinceOverride?: string
): Promise<SyncOneResult> {
  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, sales_channel_id, last_synced_at, sales_channels(store_id, stores(brand_id, brands(organization_id)))")
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

  // Grava a tentativa ANTES de processar — "última tentativa" fica visível
  // no painel de monitoramento mesmo que a execução falhe logo em seguida
  // (last_synced_at só avança em sucesso, ver final da função).
  await supabase.from("integrations").update({ last_sync_started_at: new Date().toISOString() }).eq("id", integrationId);

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
  const since = sinceOverride ?? computeSyncSince(integration.last_synced_at);

  try {
    // Retentativa (até 2x, atraso progressivo) só pra falha transitória de
    // rede/API — nunca insiste num erro definitivo de autenticação.
    const orders = await withRetry(() => adapter.fetchOrders({ since }));

    let upserted = 0;
    let failed = 0;
    let maxOrderedAt: string | null = null;

    for (const order of orders) {
      const result = await persistNormalizedOrder(supabase, order, organizationId, { sync_job_id: syncJob.id });
      if (result.ok) {
        upserted++;
        if (!maxOrderedAt || order.ordered_at > maxOrderedAt) maxOrderedAt = order.ordered_at;
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

    // last_synced_at (= último SUCESSO) e last_cursor só avançam quando pelo
    // menos os itens gravados com sucesso terminaram — nunca em cima de uma
    // execução que falhou por completo.
    if (upserted > 0 || orders.length === 0) {
      const updatePayload: Record<string, string> = { last_synced_at: new Date().toISOString(), last_cursor: new Date().toISOString() };
      if (maxOrderedAt) updatePayload.last_order_synced_at = maxOrderedAt;
      await supabase.from("integrations").update(updatePayload).eq("id", integrationId);

      // Avisa telas conectadas (Produtos vendidos, viewer restrito) sem
      // precisar de polling — preservam seus próprios filtros de
      // período/loja/produto, só refazem a consulta com o que já tinham.
      await broadcastSyncCompleted(supabase, {
        storeIds: [storeId],
        ordersProcessed: orders.length,
        syncedAt: new Date().toISOString(),
      });
    }

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
