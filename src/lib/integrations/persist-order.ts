import type { createClient } from "@/lib/supabase/server";
import { hashIdentifier, maskEmail, maskPhone, normalizePhone } from "@/lib/customers/mask";
import type { NormalizedOrder } from "@/lib/integrations/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function upsertCustomer(
  supabase: SupabaseServerClient,
  organizationId: string,
  name?: string,
  phone?: string,
  email?: string
): Promise<string | null> {
  if (!phone && !email) return null;

  const phoneHash = phone ? hashIdentifier(normalizePhone(phone)) : null;
  const emailHash = email ? hashIdentifier(email.trim().toLowerCase()) : null;

  const orFilters = [
    phoneHash ? `phone_hash.eq.${phoneHash}` : null,
    emailHash ? `email_hash.eq.${emailHash}` : null,
  ]
    .filter(Boolean)
    .join(",");

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .or(orFilters)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      organization_id: organizationId,
      full_name: name ?? null,
      phone_masked: phone ? maskPhone(phone) : null,
      email_masked: email ? maskEmail(email) : null,
      phone_hash: phoneHash,
      email_hash: emailHash,
      first_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) return null;
  return created.id as string;
}

export interface PersistOrderResult {
  ok: boolean;
  message?: string;
}

/**
 * Grava (upsert idempotente por `sales_channel_id + source_external_id`) um
 * pedido normalizado e seus itens. Usado tanto pela importação de CSV quanto
 * pelos adaptadores de integração (Anota AI, iFood) — nenhuma tela grava
 * pedido diretamente, sempre passa por aqui.
 *
 * `provenanceTag` é anexado ao `raw_payload` para rastreabilidade (ex.:
 * `{ import_id }` para importações, `{ sync_job_id }` para sincronizações).
 */
export async function persistNormalizedOrder(
  supabase: SupabaseServerClient,
  order: NormalizedOrder,
  organizationId: string,
  provenanceTag: Record<string, string>
): Promise<PersistOrderResult> {
  const customerId = await upsertCustomer(
    supabase,
    organizationId,
    order.customer_name,
    order.customer_phone,
    order.customer_email
  );

  const { data: upserted, error: orderError } = await supabase
    .from("orders")
    .upsert(
      {
        store_id: order.store_id,
        sales_channel_id: order.sales_channel_id,
        customer_id: customerId,
        source_platform: order.source_platform,
        source_external_id: order.source_external_id,
        status: order.status,
        fulfillment_type: order.fulfillment_type,
        payment_method: order.payment_method ?? null,
        gross_amount: order.gross_amount,
        discount_amount: order.discount_amount,
        delivery_fee_amount: order.delivery_fee_amount,
        net_amount: order.net_amount ?? null,
        neighborhood_raw: order.neighborhood_raw ?? null,
        ordered_at: order.ordered_at,
        completed_at: order.completed_at ?? null,
        cancelled_at: order.cancelled_at ?? (order.status === "cancelado" ? order.ordered_at : null),
        synced_at: order.synced_at,
        source_updated_at: order.source_updated_at ?? null,
        connector_version: order.connector_version,
        sync_status: "success",
        raw_payload: { ...order.raw_payload, ...provenanceTag },
      },
      { onConflict: "sales_channel_id,source_external_id" }
    )
    .select("id")
    .single();

  if (orderError || !upserted) {
    return { ok: false, message: orderError?.message ?? "Falha ao gravar pedido" };
  }

  // Idempotência dos itens: substitui o conjunto de itens a cada (re)sincronização do pedido.
  await supabase.from("order_items").delete().eq("order_id", upserted.id);

  if (order.items.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(
      order.items.map((item) => ({
        order_id: upserted.id,
        original_name: item.original_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price || item.unit_price * item.quantity,
        is_addon: item.is_addon ?? false,
      }))
    );
    if (itemsError) {
      return { ok: false, message: itemsError.message };
    }
  }

  if (order.cancellation_reason) {
    await supabase.from("cancellations").upsert(
      {
        order_id: upserted.id,
        reason: order.cancellation_reason,
        reason_source: "plataforma",
        cancelled_at: order.cancelled_at ?? order.synced_at,
      },
      { onConflict: "order_id" }
    );
  }

  return { ok: true };
}
