import Papa from "papaparse";
import type { NormalizedOrder, NormalizedOrderItem } from "@/lib/integrations/types";
import { orderImportRowSchema, type OrderImportRow } from "@/lib/validations/import";

export const CSV_IMPORT_CONNECTOR_VERSION = "1.0.0";

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
}

/** Faz o parsing bruto do CSV/planilha para linhas de texto (etapa "identificação de colunas"). */
export function parseCsvText(text: string): ParsedCsvResult {
  const withoutBom = text.replace(/^﻿/, "");
  const result = Papa.parse<Record<string, string>>(withoutBom, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
  };
}

/** Aplica o mapeamento de colunas escolhido pelo usuário (coluna do arquivo → campo interno). */
export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>
): Record<string, string>[] {
  return rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [internalField, fileColumn] of Object.entries(mapping)) {
      if (fileColumn && row[fileColumn] !== undefined) {
        mapped[internalField] = row[fileColumn];
      }
    }
    return mapped;
  });
}

export interface RowValidationResult {
  rowNumber: number;
  valid: boolean;
  data?: OrderImportRow;
  errors?: { column?: string; message: string }[];
}

/** Valida cada linha já mapeada com o schema Zod de pedidos, sem interromper no primeiro erro. */
export function validateOrderRows(mappedRows: Record<string, string>[]): RowValidationResult[] {
  return mappedRows.map((row, index) => {
    const result = orderImportRowSchema.safeParse(row);
    if (result.success) {
      return { rowNumber: index + 1, valid: true, data: result.data };
    }
    return {
      rowNumber: index + 1,
      valid: false,
      errors: result.error.issues.map((issue) => ({
        column: issue.path.join("."),
        message: issue.message,
      })),
    };
  });
}

const STATUS_MAP: Record<string, NormalizedOrder["status"]> = {
  criado: "criado",
  confirmado: "confirmado",
  "em preparo": "em_preparo",
  "em_preparo": "em_preparo",
  "saiu para entrega": "saiu_para_entrega",
  "saiu_para_entrega": "saiu_para_entrega",
  concluido: "concluido",
  "concluído": "concluido",
  entregue: "concluido",
  cancelado: "cancelado",
};

function normalizeStatus(raw: string): NormalizedOrder["status"] {
  return STATUS_MAP[raw.trim().toLowerCase()] ?? "criado";
}

function parseItemsField(raw?: string): NormalizedOrderItem[] {
  if (!raw) return [];
  // Formato esperado: "2x Combo Chef; 1x Refrigerante"
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+(?:[.,]\d+)?)\s*x\s*(.+)$/i);
      if (match) {
        return {
          original_name: match[2].trim(),
          quantity: Number(match[1].replace(",", ".")),
          unit_price: 0,
          total_price: 0,
        };
      }
      return { original_name: part, quantity: 1, unit_price: 0, total_price: 0 };
    });
}

/**
 * Converte uma linha já validada (formato "pedidos") no formato interno
 * canônico NormalizedOrder. store_id/sales_channel_id vêm do contexto da
 * importação (loja escolhida na tela), não da planilha.
 */
export function toNormalizedOrder(
  row: OrderImportRow,
  context: { store_id: string; sales_channel_id: string }
): NormalizedOrder {
  const now = new Date().toISOString();
  return {
    source_platform: "csv_import",
    source_external_id: row.pedido_id,
    synced_at: now,
    connector_version: CSV_IMPORT_CONNECTOR_VERSION,
    store_id: context.store_id,
    sales_channel_id: context.sales_channel_id,
    status: normalizeStatus(row.status),
    fulfillment_type: row.tipo_entrega?.toLowerCase().includes("retirada") ? "retirada" : "entrega",
    payment_method: row.forma_pagamento,
    gross_amount: row.valor_bruto,
    discount_amount: row.desconto ?? 0,
    delivery_fee_amount: row.taxa_entrega ?? 0,
    net_amount: row.valor_liquido,
    neighborhood_raw: row.bairro,
    customer_name: row.cliente_nome,
    customer_phone: row.cliente_telefone,
    customer_email: row.cliente_email,
    ordered_at: row.data_pedido,
    cancellation_reason: row.motivo_cancelamento,
    items: parseItemsField(row.itens),
    raw_payload: { ...row },
  };
}
