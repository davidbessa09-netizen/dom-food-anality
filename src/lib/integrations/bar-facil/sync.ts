import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/security/crypto";
import { persistNormalizedOrder } from "@/lib/integrations/persist-order";
import { BarFacilAdapter, BAR_FACIL_CONNECTOR_VERSION } from "./adapter";
import { toNormalizedBarFacilOrder } from "./mapping";
import type { BarFacilConfig } from "./config";

export interface BarFacilSyncResult {
  ok: boolean;
  eventosProcessed: number;
  ordersProcessed: number;
  errors: string[];
}

/**
 * Sincroniza todas as lojas vinculadas (barfacil_establishment_links com
 * status='vinculado') de uma vez. Diferente da Anota AI, o Bar Fácil NÃO
 * usa um cursor de timestamp do nosso lado — o próprio Bar Fácil guarda
 * "até onde já foi confirmado" por evento, e só avança quando recebe o PUT
 * de confirmação (ver bar-facil/adapter.ts). Por isso: busca (POST) →
 * persiste tudo com sucesso → só ENTÃO confirma (PUT). Se a persistência
 * falhar no meio, não confirma nada daquele evento — o próximo ciclo
 * recebe os MESMOS registros de novo (upsert idempotente, sem duplicar).
 */
export async function syncBarFacilIntegration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  trigger: "manual" | "scheduled" | "retry" | "reconciliation"
): Promise<BarFacilSyncResult> {
  void trigger;

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, config")
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
    .select("id, external_establishment_id, store_id")
    .eq("status", "vinculado")
    .not("store_id", "is", null);

  const errors: string[] = [];
  let ordersProcessed = 0;
  let eventosProcessed = 0;

  await supabase.from("integrations").update({ last_sync_started_at: new Date().toISOString() }).eq("id", integration.id);

  for (const link of links ?? []) {
    const eventoId = Number(link.external_establishment_id);
    if (!Number.isFinite(eventoId)) {
      errors.push(`Vínculo ${link.id}: ID de evento inválido ("${link.external_establishment_id}").`);
      continue;
    }

    const storeId = link.store_id as string;
    const salesChannelId = await getOrCreateBarFacilSalesChannel(supabase, storeId);
    if (!salesChannelId) {
      errors.push(`Loja ${storeId}: não foi possível preparar o canal de vendas Bar Fácil.`);
      continue;
    }

    const { data: storeRow } = await supabase.from("stores").select("brand_id, brands(organization_id)").eq("id", storeId).maybeSingle();
    const organizationId = (storeRow as unknown as { brands: { organization_id: string } } | null)?.brands?.organization_id;
    if (!organizationId) {
      errors.push(`Loja ${storeId}: organização não encontrada.`);
      continue;
    }

    try {
      const vendas = await adapter.queryVendas(eventoId);
      eventosProcessed++;

      if (vendas.length === 0) continue;

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

      // Só confirma se TODOS os registros deste lote foram gravados —
      // caso contrário o Bar Fácil reenvia o lote inteiro no próximo ciclo.
      if (failed === 0) {
        await adapter.confirmVendas(eventoId);
      } else {
        errors.push(`Evento ${eventoId}: ${failed} venda(s) não gravada(s) — confirmação adiada pro próximo ciclo.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      errors.push(`Evento ${eventoId}: ${message}`);
    }
  }

  if (errors.length === 0) {
    await supabase.from("integrations").update({ last_synced_at: new Date().toISOString(), last_cursor: new Date().toISOString() }).eq("id", integration.id);
  }

  return { ok: errors.length === 0, eventosProcessed, ordersProcessed, errors };
}

/** Um sales_channel por loja vinculada (platform='bar_facil') — igual ao
 * padrão da Anota AI, necessário pra chave de dedup `sales_channel_id +
 * source_external_id` em orders. */
async function getOrCreateBarFacilSalesChannel(
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
