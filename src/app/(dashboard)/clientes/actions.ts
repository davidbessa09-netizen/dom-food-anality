"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/log";

export interface AnonymizeResult {
  ok: boolean;
  error?: string;
}

/**
 * Exercício do direito de exclusão/anonimização (LGPD art. 18): substitui
 * todo identificador pessoal por null de forma irreversível. O histórico
 * agregado de pedidos permanece (necessário para métricas), só deixa de
 * estar associado a uma pessoa identificável.
 */
export async function anonymizeCustomer(customerId: string): Promise<AnonymizeResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("id, organization_id")
    .eq("id", customerId)
    .maybeSingle();

  if (fetchError || !customer) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const { error } = await supabase
    .from("customers")
    .update({
      full_name: null,
      phone_masked: null,
      email_masked: null,
      phone_hash: null,
      email_hash: null,
    })
    .eq("id", customerId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await logAudit(supabase, {
    organizationId: customer.organization_id,
    actorUserId: user?.id ?? null,
    action: "anonymize_customer",
    entityType: "customer",
    entityId: customerId,
  });

  revalidatePath("/clientes");
  return { ok: true };
}
