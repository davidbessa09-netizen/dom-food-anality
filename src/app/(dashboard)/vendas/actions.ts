"use server";

import { createClient } from "@/lib/supabase/server";
import { formatPaymentMethod } from "@/lib/format/payment-method";

const EXPORT_ROW_CAP = 5000;

export interface ExportTransactionsParams {
  storeIds: string[];
  periodStart: string;
  periodEnd: string;
  channel?: string | null;
  status?: string | null;
  fulfillment?: string | null;
  payment?: string | null;
  neighborhood?: string | null;
  minValue?: string | null;
  maxValue?: string | null;
  search?: string | null;
}

interface ExportOrderRow {
  ordered_at: string;
  status: string;
  fulfillment_type: string;
  source_platform: string;
  payment_method: string | null;
  neighborhood_raw: string | null;
  gross_amount: number;
  discount_amount: number;
  delivery_fee_amount: number;
  net_amount: number | null;
  customers: { full_name: string | null } | { full_name: string | null }[] | null;
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Reexecuta a mesma query da tabela de transações (sem paginação, até
 * EXPORT_ROW_CAP linhas) e devolve um CSV pronto pra download — usado pelo
 * botão "Exportar" da aba Transações. Não reusa a página de UI porque o
 * export não precisa do drawer/expand, só do texto plano. */
export async function exportTransactionsCsv(params: ExportTransactionsParams) {
  const supabase = await createClient();
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  let query = supabase
    .from("orders")
    .select(
      "ordered_at, status, fulfillment_type, source_platform, payment_method, neighborhood_raw, gross_amount, discount_amount, delivery_fee_amount, net_amount, customers(full_name)"
    )
    .in("store_id", params.storeIds.length ? params.storeIds : fallback)
    .gte("ordered_at", params.periodStart)
    .lte("ordered_at", params.periodEnd)
    .order("ordered_at", { ascending: false })
    .limit(EXPORT_ROW_CAP);

  if (params.channel) query = query.eq("source_platform", params.channel);
  if (params.status) query = query.eq("status", params.status);
  if (params.fulfillment) query = query.eq("fulfillment_type", params.fulfillment);
  if (params.payment) query = query.eq("payment_method", params.payment);
  if (params.neighborhood) query = query.eq("neighborhood_raw", params.neighborhood);
  if (params.minValue) query = query.gte("gross_amount", Number(params.minValue));
  if (params.maxValue) query = query.lte("gross_amount", Number(params.maxValue));

  const { data } = await query;
  const rows = (data ?? []) as unknown as ExportOrderRow[];

  const header = [
    "Data",
    "Status",
    "Tipo",
    "Canal",
    "Pagamento",
    "Bairro",
    "Cliente",
    "Faturamento bruto",
    "Descontos",
    "Taxa de entrega",
    "Faturamento líquido",
  ];

  const lines = rows.map((o) => {
    const customer = Array.isArray(o.customers) ? o.customers[0] : o.customers;
    return [
      new Date(o.ordered_at).toLocaleString("pt-BR"),
      o.status,
      o.fulfillment_type,
      o.source_platform,
      formatPaymentMethod(o.payment_method),
      o.neighborhood_raw ?? "",
      customer?.full_name ?? "Não identificado",
      String(o.gross_amount),
      String(o.discount_amount),
      String(o.delivery_fee_amount),
      o.net_amount === null ? "" : String(o.net_amount),
    ]
      .map(csvField)
      .join(";");
  });

  const csv = [header.map(csvField).join(";"), ...lines].join("\n");
  return { csv, count: rows.length, truncated: rows.length === EXPORT_ROW_CAP };
}
