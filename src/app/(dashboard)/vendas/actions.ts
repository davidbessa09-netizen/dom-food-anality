"use server";

import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { formatPaymentMethod } from "@/lib/format/payment-method";
import { formatDateTimeBR } from "@/lib/dates/format";

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
  raw_payload: Record<string, unknown> | null;
  customers: { full_name: string | null } | { full_name: string | null }[] | null;
}

/** Mesma extração usada na tabela de Transações (ver page.tsx) — número do
 * pedido gerado pela Anota AI, único por pedido. */
function extractOrderNumber(sourcePlatform: string, rawPayload: Record<string, unknown> | null): string {
  if (sourcePlatform !== "anota_ai") return "";
  const shortReference = rawPayload?.shortReference;
  return shortReference !== undefined && shortReference !== null ? String(shortReference) : "";
}

/** Nome bruto do pedido (raw_payload.customer.name) — só informação, nunca
 * identidade de cliente verificada (ver nota em page.tsx). */
function extractRawCustomerName(sourcePlatform: string, rawPayload: Record<string, unknown> | null): string | null {
  if (sourcePlatform !== "anota_ai") return null;
  const customer = rawPayload?.customer as { name?: unknown } | undefined;
  const name = customer?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** Reexecuta a mesma query da tabela de transações (sem paginação, até
 * EXPORT_ROW_CAP linhas) e devolve um .xlsx pronto pra download (em base64,
 * pra atravessar a fronteira da server action) — usado pelo botão
 * "Exportar" da aba Transações. Não reusa a página de UI porque o export
 * não precisa do drawer/expand, só das linhas. */
export async function exportTransactionsXlsx(params: ExportTransactionsParams) {
  const supabase = await createClient();
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  let query = supabase
    .from("orders")
    .select(
      "ordered_at, status, fulfillment_type, source_platform, payment_method, neighborhood_raw, gross_amount, discount_amount, delivery_fee_amount, net_amount, raw_payload, customers(full_name)"
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

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transações");
  sheet.columns = [
    { header: "Data", key: "data", width: 18 },
    { header: "Nº do pedido", key: "orderNumber", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Canal", key: "canal", width: 12 },
    { header: "Pagamento", key: "pagamento", width: 18 },
    { header: "Bairro", key: "bairro", width: 18 },
    { header: "Cliente", key: "cliente", width: 24 },
    { header: "Faturamento bruto", key: "bruto", width: 16 },
    { header: "Descontos", key: "descontos", width: 14 },
    { header: "Taxa de entrega", key: "taxaEntrega", width: 14 },
    { header: "Faturamento líquido", key: "liquido", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const o of rows) {
    const customer = Array.isArray(o.customers) ? o.customers[0] : o.customers;
    sheet.addRow({
      data: formatDateTimeBR(o.ordered_at),
      orderNumber: extractOrderNumber(o.source_platform, o.raw_payload),
      status: o.status,
      tipo: o.fulfillment_type,
      canal: o.source_platform,
      pagamento: formatPaymentMethod(o.payment_method),
      bairro: o.neighborhood_raw ?? "",
      cliente: customer?.full_name ?? extractRawCustomerName(o.source_platform, o.raw_payload) ?? "Não identificado",
      bruto: o.gross_amount,
      descontos: o.discount_amount,
      taxaEntrega: o.delivery_fee_amount,
      liquido: o.net_amount,
    });
  }

  for (const key of ["bruto", "descontos", "taxaEntrega", "liquido"]) {
    sheet.getColumn(key).numFmt = '"R$" #,##0.00';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { base64: Buffer.from(buffer).toString("base64"), count: rows.length, truncated: rows.length === EXPORT_ROW_CAP };
}
