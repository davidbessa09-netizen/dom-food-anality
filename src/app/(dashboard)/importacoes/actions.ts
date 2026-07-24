"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { orderImportRowSchema } from "@/lib/validations/import";
import { toNormalizedOrder } from "@/lib/integrations/csv-import/adapter";
import { persistNormalizedOrder } from "@/lib/integrations/persist-order";

export interface ImportOrdersInput {
  storeId: string;
  salesChannelId: string;
  fileName: string;
  mapping: Record<string, string>;
  rawRows: Record<string, string>[];
}

export interface ImportOrdersResult {
  importId?: string;
  rowsTotal: number;
  rowsImported: number;
  rowsFailed: number;
  error?: string;
}

function applyMapping(row: Record<string, string>, mapping: Record<string, string>) {
  const mapped: Record<string, string> = {};
  for (const [internalField, fileColumn] of Object.entries(mapping)) {
    if (fileColumn && row[fileColumn] !== undefined) {
      mapped[internalField] = row[fileColumn];
    }
  }
  return mapped;
}

export async function importOrders(input: ImportOrdersInput): Promise<ImportOrdersResult> {
  const supabase = await createClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, brand_id, brands(organization_id)")
    .eq("id", input.storeId)
    .single();

  if (storeError || !store) {
    return { rowsTotal: input.rawRows.length, rowsImported: 0, rowsFailed: input.rawRows.length, error: "Loja não encontrada ou sem permissão." };
  }

  const organizationId = (store as unknown as { brands: { organization_id: string } }).brands
    .organization_id;

  const { data: importRow, error: importError } = await supabase
    .from("imports")
    .insert({
      organization_id: organizationId,
      store_id: input.storeId,
      import_type: "pedidos",
      file_name: input.fileName,
      status: "processando",
      column_mapping: input.mapping,
      rows_total: input.rawRows.length,
    })
    .select("id")
    .single();

  if (importError || !importRow) {
    return {
      rowsTotal: input.rawRows.length,
      rowsImported: 0,
      rowsFailed: input.rawRows.length,
      error: "Não foi possível criar o registro de importação.",
    };
  }

  const importId = importRow.id as string;
  let rowsImported = 0;
  let rowsFailed = 0;

  for (let i = 0; i < input.rawRows.length; i++) {
    const mapped = applyMapping(input.rawRows[i], input.mapping);
    const parsed = orderImportRowSchema.safeParse(mapped);

    if (!parsed.success) {
      rowsFailed++;
      await supabase.from("import_errors").insert(
        parsed.error.issues.map((issue) => ({
          import_id: importId,
          row_number: i + 1,
          column_name: issue.path.join(".") || null,
          message: issue.message,
          raw_row: input.rawRows[i],
        }))
      );
      continue;
    }

    const normalized = toNormalizedOrder(parsed.data, {
      store_id: input.storeId,
      sales_channel_id: input.salesChannelId,
    });

    const result = await persistNormalizedOrder(supabase, normalized, organizationId, { import_id: importId });
    if (result.ok) {
      rowsImported++;
    } else {
      rowsFailed++;
      await supabase.from("import_errors").insert({
        import_id: importId,
        row_number: i + 1,
        message: result.message ?? "Falha ao gravar o pedido",
        raw_row: input.rawRows[i],
      });
    }
  }

  const finalStatus = rowsFailed === 0 ? "concluido" : rowsImported === 0 ? "falhou" : "concluido_com_erros";

  await supabase
    .from("imports")
    .update({ status: finalStatus, rows_imported: rowsImported, rows_failed: rowsFailed })
    .eq("id", importId);

  revalidatePath("/importacoes");
  revalidatePath("/dashboard");

  return { importId, rowsTotal: input.rawRows.length, rowsImported, rowsFailed };
}

export interface ImportErrorRow {
  row_number: number;
  column_name: string | null;
  message: string;
}

export async function getImportErrors(importId: string): Promise<ImportErrorRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("import_errors")
    .select("row_number, column_name, message")
    .eq("import_id", importId)
    .order("row_number")
    .limit(200);
  return (data ?? []) as ImportErrorRow[];
}

export async function undoImport(importId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: ordersToDelete } = await supabase
    .from("orders")
    .select("id")
    .contains("raw_payload", { import_id: importId });

  if (ordersToDelete && ordersToDelete.length > 0) {
    const ids = ordersToDelete.map((o) => o.id);
    const { error: deleteError } = await supabase.from("orders").delete().in("id", ids);
    if (deleteError) {
      return { ok: false, error: deleteError.message };
    }
  }

  const { error } = await supabase
    .from("imports")
    .update({ status: "desfeito", undone_at: new Date().toISOString() })
    .eq("id", importId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/importacoes");
  revalidatePath("/dashboard");
  return { ok: true };
}
