import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/security/crypto";
import { persistNormalizedOrder } from "@/lib/integrations/persist-order";
import { computeSyncSince, computeReconciliationSince } from "@/lib/integrations/sync-window";
import { BarFacilAdapter, BAR_FACIL_CONNECTOR_VERSION } from "./adapter";
import { toNormalizedBarFacilOrder } from "./mapping";
import type { BarFacilConfig } from "./config";

export interface BarFacilSyncResult {
  ok: boolean;
  eventosProcessed: number;
  ordersProcessed: number;
  errors: string[];
  debug?: { since: string; until: string; vendasFetched: number; lastSyncedAtBefore: string | null };
}

/**
 * Sincroniza a integração Bar Fácil usando filtro de PERÍODO (dtInicio/
 * dtTermino), não `evento` — confirmado ao vivo em 2026-08-07 que o
 * estabelecimento (Central Food Park) não usa o conceito de evento no dia
 * a dia (uso diário, sem "Eventos" configurados), e que `/vendas` aceita
 * esse filtro alternativo (a documentação em PDF só mostrava `evento`).
 *
 * Sem cursor do lado do Bar Fácil nesse modo (não há PUT/DELETE
 * documentado pra filtro de data) — usamos o mesmo padrão de janela
 * incremental com sobreposição já validado na Anota AI
 * ([[computeSyncSince]], 10min de overlap): busca desde um pouco antes do
 * último sucesso, nunca exatamente em cima dele. O dedup por `codVenda`
 * na persistência (upsert idempotente) garante que reprocessar a mesma
 * janela nunca duplica nada.
 *
 * Os dados retornados são da EMPRESA inteira (não por loja) — por isso,
 * se houver mais de um vínculo "vinculado", todas as vendas são
 * atribuídas ao primeiro (cenário atual: só uma loja por integração).
 */
export async function syncBarFacilIntegration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  trigger: "manual" | "scheduled" | "retry" | "reconciliation"
): Promise<BarFacilSyncResult> {
  const { data: integration } = await supabase
    .from("integrations")
    .select("id, config, last_synced_at")
    .eq("platform", "bar_facil")
    .maybeSingle();

  if (!integration) {
    return { ok: false, eventosProcessed: 0, ordersProcessed: 0, errors: ["Integração Bar Fácil não configurada."] };
  }

  const { data: credential } = await supabase
    .from("integration_credentials")
    .select("encrypted_value")
    .eq("integration_id", integration.id)
    .eq("key", "token")
    .maybeSingle();

  if (!credential?.encrypted_value) {
    return { ok: false, eventosProcessed: 0, ordersProcessed: 0, errors: ["Nenhum token cadastrado para o Bar Fácil."] };
  }

  let token: string;
  try {
    token = decryptSecret(credential.encrypted_value);
  } catch {
    return { ok: false, eventosProcessed: 0, ordersProcessed: 0, errors: ["Falha ao decodificar o token salvo."] };
  }

  const config = (integration.config ?? {}) as BarFacilConfig;
  const adapter = new BarFacilAdapter(token, config.environment ?? "producao");
  const timezone = config.timezone ?? "America/Sao_Paulo";

  const { data: links } = await supabase
    .from("barfacil_establishment_links")
    .select("id, store_id")
    .eq("status", "vinculado")
    .not("store_id", "is", null);

  const errors: string[] = [];

  if (!links || links.length === 0) {
    return { ok: false, eventosProcessed: 0, ordersProcessed: 0, errors: ["Nenhuma loja vinculada — cadastre o vínculo em Mapeamento de lojas."] };
  }
  if (links.length > 1) {
    errors.push(`${links.length} lojas vinculadas, mas os dados do Bar Fácil vêm por empresa (não por loja) — atribuindo tudo à primeira.`);
  }

  const storeId = links[0].store_id as string;

  const salesChannelId = await getOrCreateBarFacilSalesChannel(supabase, storeId);
  if (!salesChannelId) {
    return { ok: false, eventosProcessed: 0, ordersProcessed: 0, errors: ["Não foi possível preparar o canal de vendas Bar Fácil."] };
  }

  const { data: storeRow } = await supabase.from("stores").select("brand_id, brands(organization_id)").eq("id", storeId).maybeSingle();
  const organizationId = (storeRow as unknown as { brands: { organization_id: string } } | null)?.brands?.organization_id;
  if (!organizationId) {
    return { ok: false, eventosProcessed: 0, ordersProcessed: 0, errors: ["Organização da loja vinculada não encontrada."] };
  }

  await supabase.from("integrations").update({ last_sync_started_at: new Date().toISOString() }).eq("id", integration.id);

  // Sem last_synced_at ainda (primeira sincronização, ou reset manual),
  // usa a "data inicial da importação" configurada em vez de só 24h —
  // senão uma venda de alguns dias atrás nunca seria buscada (a janela
  // incremental sempre avança pra frente a cada ciclo, mesmo vazio).
  const neverSyncedFallback = config.importStartDate ? new Date(config.importStartDate).toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const sinceIso =
    trigger === "reconciliation" ? computeReconciliationSince() : (computeSyncSince(integration.last_synced_at) ?? neverSyncedFallback);
  const since = new Date(sinceIso);
  const until = new Date();

  let ordersProcessed = 0;
  let vendasFetched = 0;

  try {
    const vendas = await adapter.queryVendasPorPeriodo(since, until);
    vendasFetched = vendas.length;

    let failed = 0;
    for (const venda of vendas) {
      const normalized = toNormalizedBarFacilOrder(venda, {
        store_id: storeId,
        sales_channel_id: salesChannelId,
        connectorVersion: BAR_FACIL_CONNECTOR_VERSION,
        timezone,
      });
      const result = await persistNormalizedOrder(supabase, normalized, organizationId, { source: "bar_facil" });
      if (result.ok) ordersProcessed++;
      else failed++;
    }

    if (failed > 0) {
      errors.push(`${failed} venda(s) não gravada(s).`);
    }

    if (failed === 0) {
      await supabase.from("integrations").update({ last_synced_at: new Date().toISOString(), last_cursor: new Date().toISOString() }).eq("id", integration.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    errors.push(message);
  }

  return {
    ok: errors.length === 0,
    eventosProcessed: 1,
    ordersProcessed,
    errors,
    debug: { since: since.toISOString(), until: until.toISOString(), vendasFetched, lastSyncedAtBefore: integration.last_synced_at },
  };
}

/** Um sales_channel por loja vinculada (platform='bar_facil') — igual ao
 * padrão da Anota AI, necessário pra chave de dedup `sales_channel_id +
 * source_external_id` em orders. */
export async function getOrCreateBarFacilSalesChannel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  storeId: string
): Promise<string | null> {
  const { data: existing } = await supabase.from("sales_channels").select("id").eq("store_id", storeId).eq("platform", "bar_facil").maybeSingle();
  if (existing) return existing.id as string;

  const { data: created } = await supabase
    .from("sales_channels")
    .insert({ store_id: storeId, platform: "bar_facil", is_active: true })
    .select("id")
    .single();

  return created?.id ?? null;
}
