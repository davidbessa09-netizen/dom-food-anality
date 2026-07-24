"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveAnotaAiCredentialSchema } from "@/lib/validations/integration";
import { encryptSecret } from "@/lib/security/crypto";
import { ANOTA_AI_CONNECTOR_VERSION, AnotaAIAdapter } from "@/lib/integrations/anota-ai/adapter";
import { syncAnotaAiIntegration } from "@/lib/integrations/anota-ai/sync";
import { decryptSecret } from "@/lib/security/crypto";
import { findOrCreateCategory, persistNormalizedProduct } from "@/lib/integrations/persist-product";

export interface SaveCredentialState {
  error?: string;
  success?: boolean;
}

export async function saveAnotaAiCredential(
  _prev: SaveCredentialState,
  formData: FormData
): Promise<SaveCredentialState> {
  const parsed = saveAnotaAiCredentialSchema.safeParse({
    sales_channel_id: formData.get("sales_channel_id"),
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { data: existingIntegration } = await supabase
    .from("integrations")
    .select("id")
    .eq("sales_channel_id", parsed.data.sales_channel_id)
    .maybeSingle();

  let integrationId = existingIntegration?.id as string | undefined;

  if (!integrationId) {
    const { data: created, error: createError } = await supabase
      .from("integrations")
      .insert({
        sales_channel_id: parsed.data.sales_channel_id,
        platform: "anota_ai",
        connector_version: ANOTA_AI_CONNECTOR_VERSION,
      })
      .select("id")
      .single();

    if (createError || !created) {
      return { error: "Não foi possível criar a integração. Verifique suas permissões para esta loja." };
    }
    integrationId = created.id as string;
  }

  const encrypted = encryptSecret(parsed.data.token);

  const { data: existingCredential } = await supabase
    .from("integration_credentials")
    .select("id")
    .eq("integration_id", integrationId)
    .maybeSingle();

  const credentialResult = existingCredential
    ? await supabase
        .from("integration_credentials")
        .update({ encrypted_value: encrypted, updated_at: new Date().toISOString() })
        .eq("id", existingCredential.id)
    : await supabase.from("integration_credentials").insert({
        integration_id: integrationId,
        encrypted_value: encrypted,
      });

  if (credentialResult.error) {
    return { error: "Não foi possível salvar o token." };
  }

  revalidatePath("/integracoes");
  return { success: true };
}

export interface SyncResult {
  ok: boolean;
  ordersProcessed: number;
  error?: string;
}

export async function syncAnotaAiNow(integrationId: string): Promise<SyncResult> {
  const supabase = await createClient();
  const result = await syncAnotaAiIntegration(supabase, integrationId, "manual");

  revalidatePath("/integracoes");
  revalidatePath("/dashboard");

  return { ok: result.ok, ordersProcessed: result.ordersProcessed, error: result.error };
}

export interface MenuSyncResult {
  ok: boolean;
  categoriesProcessed: number;
  productsProcessed: number;
  error?: string;
}

export async function syncAnotaAiMenu(integrationId: string): Promise<MenuSyncResult> {
  const supabase = await createClient();

  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, sales_channel_id, sales_channels(store_id, stores(brand_id))")
    .eq("id", integrationId)
    .single();

  if (integrationError || !integration) {
    return { ok: false, categoriesProcessed: 0, productsProcessed: 0, error: "Integração não encontrada." };
  }

  const { data: credential } = await supabase
    .from("integration_credentials")
    .select("encrypted_value")
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (!credential?.encrypted_value) {
    return { ok: false, categoriesProcessed: 0, productsProcessed: 0, error: "Nenhum token cadastrado para esta integração." };
  }

  const salesChannel = integration.sales_channels as unknown as { store_id: string; stores: { brand_id: string } };
  const brandId = salesChannel.stores.brand_id;

  let token: string;
  try {
    token = decryptSecret(credential.encrypted_value);
  } catch {
    return { ok: false, categoriesProcessed: 0, productsProcessed: 0, error: "Falha ao decodificar a credencial salva." };
  }

  const adapter = new AnotaAIAdapter(token, {
    store_id: salesChannel.store_id,
    sales_channel_id: integration.sales_channel_id,
  });

  try {
    const products = await adapter.fetchMenu();

    const categoryCache = new Map<string, string | null>();
    let failed = 0;

    for (const product of products) {
      if (product.category_name && !categoryCache.has(product.category_name)) {
        categoryCache.set(product.category_name, await findOrCreateCategory(supabase, brandId, product.category_name));
      }
      const result = await persistNormalizedProduct(supabase, product);
      if (!result.ok) failed++;
    }

    revalidatePath("/integracoes");
    revalidatePath("/correspondencia-produtos");
    revalidatePath("/categorias");

    return {
      ok: failed === 0,
      categoriesProcessed: categoryCache.size,
      productsProcessed: products.length,
      error: failed > 0 ? `${failed} item(ns) falharam ao gravar` : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao buscar cardápio";
    return { ok: false, categoriesProcessed: 0, productsProcessed: 0, error: message };
  }
}

export interface SyncLogRow {
  level: string;
  message: string;
  created_at: string;
}

export async function getSyncLogs(syncJobId: string): Promise<SyncLogRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sync_logs")
    .select("level, message, created_at")
    .eq("sync_job_id", syncJobId)
    .order("created_at")
    .limit(200);
  return (data ?? []) as SyncLogRow[];
}
