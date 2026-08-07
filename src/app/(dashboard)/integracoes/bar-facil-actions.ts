"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/security/crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/log";
import { BarFacilConnector } from "@/lib/integrations/bar-facil/connector";
import { BAR_FACIL_CONNECTOR_VERSION } from "@/lib/integrations/bar-facil/adapter";
import { syncBarFacilIntegration, getOrCreateBarFacilSalesChannel } from "@/lib/integrations/bar-facil/sync";
import { BAR_FACIL_SECRET_KEYS, type BarFacilConfig } from "@/lib/integrations/bar-facil/config";
import type { ExternalStore } from "@/lib/integrations/connector";
import { findOrCreateCategory, persistNormalizedProduct } from "@/lib/integrations/persist-product";

export interface BarFacilIntegrationSummary {
  id: string | null;
  connectionStatus: "aguardando_credenciais" | "testando" | "ativo" | "erro";
  config: BarFacilConfig;
  hasCredentials: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  linkedStoresCount: number;
}

/**
 * Bar Fácil é uma integração ÚNICA por organização (não por loja como a
 * Anota AI) — o vínculo loja↔estabelecimento é resolvido depois, na tela
 * de mapeamento (ver [[listBarFacilEstablishmentLinks]]), não na criação
 * da integração em si. Por isso a busca não filtra por sales_channel_id.
 */
export async function getBarFacilIntegration(): Promise<BarFacilIntegrationSummary> {
  const supabase = await createClient();

  const { data: integration } = await supabase
    .from("integrations")
    .select("id, connection_status, config, last_synced_at")
    .eq("platform", "bar_facil")
    .maybeSingle();

  if (!integration) {
    return {
      id: null,
      connectionStatus: "aguardando_credenciais",
      config: {},
      hasCredentials: false,
      lastSyncedAt: null,
      lastError: null,
      linkedStoresCount: 0,
    };
  }

  const { count: credentialCount } = await supabase
    .from("integration_credentials")
    .select("id", { count: "exact", head: true })
    .eq("integration_id", integration.id);

  const { count: linkedCount } = await supabase
    .from("barfacil_establishment_links")
    .select("id", { count: "exact", head: true })
    .eq("status", "vinculado");

  const { data: lastFailedJob } = await supabase
    .from("sync_jobs")
    .select("error_summary")
    .eq("integration_id", integration.id)
    .eq("status", "failed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    id: integration.id,
    connectionStatus: integration.connection_status as BarFacilIntegrationSummary["connectionStatus"],
    config: (integration.config ?? {}) as BarFacilConfig,
    hasCredentials: (credentialCount ?? 0) > 0,
    lastSyncedAt: integration.last_synced_at,
    lastError: lastFailedJob?.error_summary ?? null,
    linkedStoresCount: linkedCount ?? 0,
  };
}

export interface SaveBarFacilConfigState {
  error?: string;
  success?: boolean;
}

/**
 * Salva a configuração (campos não sensíveis em `integrations.config`) e
 * os segredos informados (uma linha por chave em `integration_credentials`,
 * criptografada) — só grava as chaves que vieram preenchidas no form, pra
 * não exigir todos os campos de uma vez (a documentação oficial ainda não
 * confirmou quais são obrigatórios).
 */
export async function saveBarFacilConfig(_prev: SaveBarFacilConfigState, formData: FormData): Promise<SaveBarFacilConfigState> {
  const supabase = await createClient();

  const config: BarFacilConfig = {
    environment: stringOrUndefined(formData.get("environment")) as BarFacilConfig["environment"],
    timezone: stringOrUndefined(formData.get("timezone")),
    importStartDate: stringOrUndefined(formData.get("import_start_date")),
  };

  const { data: existing } = await supabase.from("integrations").select("id").eq("platform", "bar_facil").maybeSingle();

  let integrationId = existing?.id as string | undefined;

  if (!integrationId) {
    // Bar Fácil ainda não tem um sales_channel/loja vinculada até a tela
    // de mapeamento resolver isso — usamos um canal "guarda-lugar" a nível
    // de organização em vez de forçar a escolha de uma loja aqui.
    const { data: placeholderChannel, error: placeholderError } = await getOrCreatePlaceholderChannel(supabase);
    if (placeholderError || !placeholderChannel) {
      return { error: "Não foi possível preparar a integração (canal de vendas base ausente)." };
    }

    const { data: created, error: createError } = await supabase
      .from("integrations")
      .insert({
        sales_channel_id: placeholderChannel,
        platform: "bar_facil",
        connector_version: BAR_FACIL_CONNECTOR_VERSION,
        connection_status: "aguardando_credenciais",
        config,
        is_active: true,
      })
      .select("id")
      .single();

    if (createError || !created) {
      return { error: "Não foi possível criar a integração Bar Fácil." };
    }
    integrationId = created.id as string;
  } else {
    const { error: updateError } = await supabase.from("integrations").update({ config, updated_at: new Date().toISOString() }).eq("id", integrationId);
    if (updateError) {
      return { error: "Não foi possível salvar a configuração." };
    }
  }

  for (const key of BAR_FACIL_SECRET_KEYS) {
    const value = stringOrUndefined(formData.get(key));
    if (!value) continue;

    const encrypted = encryptSecret(value);
    const { data: existingCredential } = await supabase
      .from("integration_credentials")
      .select("id")
      .eq("integration_id", integrationId)
      .eq("key", key)
      .maybeSingle();

    if (existingCredential) {
      await supabase
        .from("integration_credentials")
        .update({ encrypted_value: encrypted, updated_at: new Date().toISOString() })
        .eq("id", existingCredential.id);
    } else {
      await supabase.from("integration_credentials").insert({ integration_id: integrationId, key, encrypted_value: encrypted });
    }
  }

  const user = await getCurrentUser();
  if (user) {
    const org = user.memberships?.[0]?.organization_id;
    if (org) {
      await logAudit(supabase, {
        organizationId: org,
        actorUserId: user.id,
        action: existing ? "update_barfacil_config" : "create_barfacil_config",
        entityType: "integration",
        entityId: integrationId,
        metadata: { platform: "bar_facil" },
      });
    }
  }

  revalidatePath("/integracoes");
  return { success: true };
}

/**
 * Canal de vendas "guarda-lugar" só pra satisfazer a FK obrigatória de
 * `integrations.sales_channel_id` antes de qualquer loja ter sido
 * vinculada — nunca aparece em métricas porque a integração fica
 * `is_active = false` até o mapeamento de lojas + implementação real.
 */
async function getOrCreatePlaceholderChannel(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ data: string | null; error: unknown }> {
  const { data: anyStore } = await supabase.from("stores").select("id").limit(1).maybeSingle();
  if (!anyStore) return { data: null, error: "no_store" };

  const { data: existingChannel } = await supabase
    .from("sales_channels")
    .select("id")
    .eq("store_id", anyStore.id)
    .eq("platform", "bar_facil")
    .maybeSingle();

  if (existingChannel) return { data: existingChannel.id as string, error: null };

  const { data: created, error } = await supabase
    .from("sales_channels")
    .insert({ store_id: anyStore.id, platform: "bar_facil", is_active: false })
    .select("id")
    .single();

  return { data: created?.id ?? null, error };
}

export interface TestConnectionResult {
  ok: boolean;
  message?: string;
}

async function getDecryptedBarFacilToken(supabase: Awaited<ReturnType<typeof createClient>>, integrationId: string): Promise<string | undefined> {
  const { data: credential } = await supabase
    .from("integration_credentials")
    .select("encrypted_value")
    .eq("integration_id", integrationId)
    .eq("key", "token")
    .maybeSingle();

  if (!credential?.encrypted_value) return undefined;
  try {
    return decryptSecret(credential.encrypted_value);
  } catch {
    return undefined;
  }
}

/**
 * Testa a conexão real com a API do Bar Fácil (POST /eventos) — só marca
 * `connection_status` como "ativo" quando essa chamada realmente
 * autentica. Nunca reporta sucesso sem uma resposta HTTP validada.
 */
export async function testBarFacilConnection(): Promise<TestConnectionResult> {
  const supabase = await createClient();
  const summary = await getBarFacilIntegration();

  if (!summary.id) {
    return { ok: false, message: "Configure a integração antes de testar a conexão." };
  }

  const token = await getDecryptedBarFacilToken(supabase, summary.id);
  const connector = new BarFacilConnector(summary.config, token);
  const result = await connector.testConnection();

  await supabase
    .from("integrations")
    .update({ connection_status: result.ok ? "ativo" : "erro", updated_at: new Date().toISOString() })
    .eq("id", summary.id);

  revalidatePath("/integracoes");
  return result;
}

export interface SyncBarFacilResult {
  ok: boolean;
  eventosProcessed: number;
  ordersProcessed: number;
  errors: string[];
}

export async function syncBarFacilNow(): Promise<SyncBarFacilResult> {
  const supabase = await createClient();
  const result = await syncBarFacilIntegration(supabase, "manual");
  revalidatePath("/integracoes");
  revalidatePath("/produtos");
  return result;
}

export interface SyncBarFacilMenuResult {
  ok: boolean;
  productsProcessed: number;
  error?: string;
}

/**
 * Sincroniza SÓ o catálogo (nome + categoria, via POST /produtos) — não
 * depende de `evento`, diferente de vendas. Sem preço: o retorno de
 * /produtos não traz `vlrCusto`/preço de venda (só id, nome, categoria) —
 * o produto fica com `price` vazio até um dia isso vir de outra fonte.
 * Usa a primeira loja com vínculo "vinculado" como canal de vendas —
 * o catálogo do Bar Fácil é único por empresa, não por evento.
 */
export async function syncBarFacilMenu(): Promise<SyncBarFacilMenuResult> {
  const supabase = await createClient();
  const summary = await getBarFacilIntegration();

  if (!summary.id) return { ok: false, productsProcessed: 0, error: "Configure a integração primeiro." };

  const token = await getDecryptedBarFacilToken(supabase, summary.id);
  if (!token) return { ok: false, productsProcessed: 0, error: "Cadastre o token do Bar Fácil primeiro." };

  const { data: link } = await supabase
    .from("barfacil_establishment_links")
    .select("store_id")
    .eq("status", "vinculado")
    .not("store_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!link?.store_id) {
    return { ok: false, productsProcessed: 0, error: "Vincule pelo menos uma loja antes de sincronizar o catálogo." };
  }

  const { data: storeRow } = await supabase.from("stores").select("brand_id").eq("id", link.store_id).maybeSingle();
  if (!storeRow) return { ok: false, productsProcessed: 0, error: "Loja vinculada não encontrada." };

  const salesChannelId = await getOrCreateBarFacilSalesChannel(supabase, link.store_id);
  if (!salesChannelId) return { ok: false, productsProcessed: 0, error: "Não foi possível preparar o canal de vendas." };

  const connector = new BarFacilConnector(summary.config, token);
  try {
    const products = await connector.listProducts();
    const categoryCache = new Map<string, string | null>();
    let failed = 0;

    for (const product of products) {
      if (product.category_name && !categoryCache.has(product.category_name)) {
        categoryCache.set(product.category_name, await findOrCreateCategory(supabase, storeRow.brand_id, product.category_name));
      }
      const result = await persistNormalizedProduct(supabase, { ...product, sales_channel_id: salesChannelId });
      if (!result.ok) failed++;
    }

    revalidatePath("/correspondencia-produtos");
    revalidatePath("/categorias");

    return {
      ok: failed === 0,
      productsProcessed: products.length,
      error: failed > 0 ? `${failed} item(ns) falharam ao gravar` : undefined,
    };
  } catch (error) {
    return { ok: false, productsProcessed: 0, error: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

/**
 * Busca os eventos direto da API do Bar Fácil pra preencher a tela de
 * mapeamento com os IDs oficiais — nunca casa por nome (ver seção 4 do
 * brief); o admin ainda escolhe manualmente qual loja DOM corresponde.
 */
export async function listBarFacilStoresFromApi(): Promise<{ stores: ExternalStore[]; error?: string }> {
  const supabase = await createClient();
  const summary = await getBarFacilIntegration();

  if (!summary.id) return { stores: [], error: "Configure a integração primeiro." };

  const token = await getDecryptedBarFacilToken(supabase, summary.id);
  if (!token) return { stores: [], error: "Cadastre o token do Bar Fácil primeiro." };

  const connector = new BarFacilConnector(summary.config, token);
  try {
    const stores = await connector.listStores();
    return { stores };
  } catch (error) {
    return { stores: [], error: error instanceof Error ? error.message : "Erro ao buscar eventos." };
  }
}

export interface BarFacilEstablishmentLinkRow {
  id: string;
  externalEstablishmentId: string;
  externalEstablishmentName: string | null;
  externalEventId: string | null;
  storeId: string | null;
  storeName: string | null;
  status: "pendente" | "vinculado" | "ignorado" | "revisar";
  notes: string | null;
}

export async function listBarFacilEstablishmentLinks(): Promise<BarFacilEstablishmentLinkRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("barfacil_establishment_links")
    .select("id, external_establishment_id, external_establishment_name, external_event_id, store_id, status, notes, stores(name)")
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Array<{
    id: string;
    external_establishment_id: string;
    external_establishment_name: string | null;
    external_event_id: string | null;
    store_id: string | null;
    status: BarFacilEstablishmentLinkRow["status"];
    notes: string | null;
    stores: { name: string } | null;
  }>).map((row) => ({
    id: row.id,
    externalEstablishmentId: row.external_establishment_id,
    externalEstablishmentName: row.external_establishment_name,
    externalEventId: row.external_event_id,
    storeId: row.store_id,
    storeName: row.stores?.name ?? null,
    status: row.status,
    notes: row.notes,
  }));
}

export interface UpsertLinkState {
  error?: string;
  success?: boolean;
}

/**
 * Cadastro manual do vínculo — usado enquanto não há um `listStores()`
 * real do Bar Fácil pra popular isso automaticamente. Sempre grava pelo
 * ID externo informado, nunca casa por nome (ver seção 4 do brief).
 */
export async function upsertBarFacilEstablishmentLink(_prev: UpsertLinkState, formData: FormData): Promise<UpsertLinkState> {
  const externalEstablishmentId = stringOrUndefined(formData.get("external_establishment_id"));
  if (!externalEstablishmentId) {
    return { error: "Informe o ID do estabelecimento/evento do Bar Fácil." };
  }

  const supabase = await createClient();
  const linkId = stringOrUndefined(formData.get("link_id"));
  const payload = {
    external_establishment_id: externalEstablishmentId,
    external_establishment_name: stringOrUndefined(formData.get("external_establishment_name")) ?? null,
    external_event_id: stringOrUndefined(formData.get("external_event_id")) ?? null,
    store_id: stringOrUndefined(formData.get("store_id")) ?? null,
    status: (stringOrUndefined(formData.get("status")) ?? "pendente") as BarFacilEstablishmentLinkRow["status"],
    notes: stringOrUndefined(formData.get("notes")) ?? null,
    updated_at: new Date().toISOString(),
  };

  const result = linkId
    ? await supabase.from("barfacil_establishment_links").update(payload).eq("id", linkId)
    : await supabase.from("barfacil_establishment_links").insert(payload);

  if (result.error) {
    return { error: "Não foi possível salvar o vínculo." };
  }

  revalidatePath("/integracoes");
  return { success: true };
}

export interface StoreOption {
  id: string;
  name: string;
}

export async function listStoresForBarFacilMapping(): Promise<StoreOption[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase.from("brands").select("id").in("organization_id", orgIds.length ? orgIds : fallback);
  const brandIds = (brands ?? []).map((b) => b.id);

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .order("name");

  return (stores ?? []) as StoreOption[];
}

export interface ImportEventsResult {
  imported: number;
  error?: string;
}

/**
 * Busca os eventos reais da API (POST /eventos) e cria um vínculo
 * "pendente" pra cada codEvento que ainda não existe em
 * barfacil_establishment_links — nunca marca como "vinculado"
 * automaticamente (o admin ainda escolhe a loja manualmente).
 */
export async function importBarFacilEventsAsPendingLinks(): Promise<ImportEventsResult> {
  const { stores, error } = await listBarFacilStoresFromApi();
  if (error) return { imported: 0, error };

  const supabase = await createClient();
  let imported = 0;

  for (const store of stores) {
    const { data: existing } = await supabase
      .from("barfacil_establishment_links")
      .select("id")
      .eq("external_establishment_id", store.externalId)
      .eq("external_event_id", store.externalEventId ?? "")
      .maybeSingle();

    if (existing) continue;

    const { error: insertError } = await supabase.from("barfacil_establishment_links").insert({
      external_establishment_id: store.externalId,
      external_establishment_name: store.name,
      external_event_id: store.externalEventId ?? null,
      status: "pendente",
    });
    if (!insertError) imported++;
  }

  revalidatePath("/integracoes");
  return { imported };
}

export async function setBarFacilEstablishmentLinkStatus(linkId: string, status: BarFacilEstablishmentLinkRow["status"]): Promise<void> {
  const supabase = await createClient();
  await supabase.from("barfacil_establishment_links").update({ status, updated_at: new Date().toISOString() }).eq("id", linkId);
  revalidatePath("/integracoes");
}

function stringOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
