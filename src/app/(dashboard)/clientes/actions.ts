"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasWriteAccess } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/log";
import { formatDateBR } from "@/lib/dates/format";

export interface AnonymizeResult {
  ok: boolean;
  error?: string;
}

/**
 * Exercício do direito de exclusão/anonimização (LGPD art. 18): substitui
 * todo identificador pessoal por null de forma irreversível. O histórico
 * agregado de pedidos permanece (necessário para métricas), só deixa de
 * estar associado a uma pessoa identificável.
 *
 * Ação restrita a admin_geral da organização do cliente — checada aqui no
 * servidor (não só escondida no menu), então mesmo uma chamada direta à
 * action falha sem essa permissão.
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

  const isOrgAdmin = (user?.memberships ?? []).some(
    (m) => m.organization_id === customer.organization_id && m.role === "admin_geral"
  );
  if (!isOrgAdmin) {
    return { ok: false, error: "Apenas administradores gerais podem anonimizar clientes." };
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

export interface CustomerHistoryOrder {
  id: string;
  orderedAt: string;
  storeName: string;
  status: string;
  grossAmount: number;
}

export interface CustomerHistoryResult {
  ok: boolean;
  error?: string;
  customer?: {
    fullName: string | null;
    phoneMasked: string | null;
    isAnonymized: boolean;
    firstSeenAt: string | null;
  };
  orders?: CustomerHistoryOrder[];
  totalOrders?: number;
  totalRevenue?: number;
}

const HISTORY_ORDERS_LIMIT = 15;

/** Histórico agregado de um cliente pro drawer — busca sob demanda (só
 * quando o drawer abre), não pré-carregado pra cada linha da tabela. */
export async function getCustomerHistory(customerId: string): Promise<CustomerHistoryResult> {
  const supabase = await createClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("full_name, phone_masked, first_seen_at")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError || !customer) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const { data: ordersRaw, count } = await supabase
    .from("orders")
    .select("id, ordered_at, status, gross_amount, stores(name)", { count: "exact" })
    .eq("customer_id", customerId)
    .order("ordered_at", { ascending: false })
    .limit(HISTORY_ORDERS_LIMIT);

  interface OrderRaw {
    id: string;
    ordered_at: string;
    status: string;
    gross_amount: number;
    stores: { name: string } | { name: string }[] | null;
  }

  const orders: CustomerHistoryOrder[] = ((ordersRaw ?? []) as unknown as OrderRaw[]).map((o) => {
    const store = Array.isArray(o.stores) ? o.stores[0] : o.stores;
    return {
      id: o.id,
      orderedAt: o.ordered_at,
      storeName: store?.name ?? "—",
      status: o.status,
      grossAmount: o.gross_amount,
    };
  });

  const { data: allOrdersForTotal } = await supabase
    .from("orders")
    .select("gross_amount, status")
    .eq("customer_id", customerId)
    .neq("status", "cancelado");
  const totalRevenue = (allOrdersForTotal ?? []).reduce((sum, o) => sum + o.gross_amount, 0);

  return {
    ok: true,
    customer: {
      fullName: customer.full_name,
      phoneMasked: customer.phone_masked,
      isAnonymized: !customer.full_name && !customer.phone_masked,
      firstSeenAt: customer.first_seen_at,
    },
    orders,
    totalOrders: count ?? orders.length,
    totalRevenue,
  };
}

export interface ExportCustomersParams {
  customerIds: string[];
}

/** Exportação respeita a mesma regra de escrita do resto do sistema — só
 * quem pode editar dados operacionais (gestor/admin) pode exportar dado
 * pessoal em massa; somente-leitura e analista não podem. */
export async function exportCustomersCsv(params: ExportCustomersParams) {
  const user = await getCurrentUser();
  const canExport = (user?.memberships ?? []).some((m) => hasWriteAccess(m.role));
  if (!canExport) {
    return { ok: false as const, error: "Sua permissão não inclui exportar dados de clientes." };
  }

  const supabase = await createClient();
  const fallback = ["00000000-0000-0000-0000-000000000000"];
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, phone_masked, first_seen_at")
    .in("id", params.customerIds.length ? params.customerIds : fallback);

  function csvField(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  const header = ["Cliente", "Telefone", "Cliente desde"].map(csvField).join(";");
  const lines = (data ?? []).map((c) =>
    [c.full_name ?? "Não identificado", c.phone_masked ?? "—", c.first_seen_at ? formatDateBR(c.first_seen_at) : "—"]
      .map(csvField)
      .join(";")
  );

  return { ok: true as const, csv: [header, ...lines].join("\n"), count: data?.length ?? 0 };
}
