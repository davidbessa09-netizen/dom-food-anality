"use server";

import { createClient } from "@/lib/supabase/server";
import { resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import { buildViewerProductSummaries, type ViewerProductSummary } from "@/lib/metrics/products-viewer";
import type { SaleItemEvent } from "@/lib/metrics/live-sales";

export type ViewerPeriodPreset = "hoje" | "ontem" | "7d";

export interface ViewerFilters {
  periodPreset: ViewerPeriodPreset;
  /** Vazio = todas as lojas autorizadas (o RLS já garante o teto real —
   * isto é só um recorte de conveniência da UI, nunca a barreira de
   * segurança). */
  storeIds: string[];
}

export interface ViewerData {
  summaries: ViewerProductSummary[];
  totalUnits: number;
  storeOptions: { id: string; name: string }[];
  generatedAt: string;
  lastDataReceivedAt: string | null;
}

interface ViewerOrderRow {
  id: string;
  ordered_at: string;
  status: string;
  store_id: string;
  order_items: { original_name: string; quantity: number; is_addon: boolean }[];
}

/**
 * Aproximação de "última sincronização" pro perfil restrito: como esse
 * papel não tem select em `integrations` (ver migration 0014), usa o
 * `created_at` mais recente entre os pedidos das lojas autorizadas como
 * indicador de frescor dos dados — não é o horário exato da última
 * tentativa, mas reflete quando o dado mais novo realmente chegou.
 */
async function getLastDataReceivedAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeIds: string[]
): Promise<string | null> {
  const fallback = ["00000000-0000-0000-0000-000000000000"];
  const { data } = await supabase
    .from("orders")
    .select("created_at")
    .in("store_id", storeIds.length ? storeIds : fallback)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.created_at ?? null;
}

/**
 * Dados de "Produtos vendidos" pro perfil restrito (Visualizador de
 * produtos) — deliberadamente NÃO consulta brands/organizations (esse
 * papel não tem policy de select nessas tabelas, ver migration 0014).
 * `stores`/`orders`/`order_items` são lidos sem filtro de marca/organização
 * porque o RLS já restringe as linhas retornadas só às lojas autorizadas —
 * o filtro de loja abaixo é só um recorte de UI sobre um conjunto que já
 * veio seguro do banco, nunca a fonte da restrição.
 */
export async function getViewerProductsSold(filters: ViewerFilters): Promise<ViewerData> {
  const supabase = await createClient();
  const preset: PeriodPreset = filters.periodPreset;
  const period = resolvePeriod(preset);

  const { data: stores } = await supabase.from("stores").select("id, name").eq("is_active", true).order("name");
  const authorizedStoreIds = (stores ?? []).map((s) => s.id);
  const scopedStoreIds = filters.storeIds.length > 0 ? filters.storeIds.filter((id) => authorizedStoreIds.includes(id)) : authorizedStoreIds;
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: orders } = await supabase
    .from("orders")
    .select("id, ordered_at, status, store_id, order_items(original_name, quantity, is_addon)")
    .in("store_id", scopedStoreIds.length ? scopedStoreIds : fallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  const rows = (orders ?? []) as unknown as ViewerOrderRow[];
  const events: SaleItemEvent[] = rows.flatMap((order) =>
    order.order_items
      .filter((item) => !item.is_addon)
      .map((item) => ({
        orderId: order.id,
        orderedAt: order.ordered_at,
        status: order.status,
        storeId: order.store_id,
        storeName: "",
        channel: "",
        paymentMethod: null,
        fulfillment: "",
        productName: item.original_name,
        quantity: item.quantity,
        totalPrice: 0,
        isAddon: item.is_addon,
      }))
  );

  const summaries = buildViewerProductSummaries(events);
  const totalUnits = summaries.reduce((sum, s) => sum + s.quantity, 0);
  const lastDataReceivedAt = await getLastDataReceivedAt(supabase, scopedStoreIds);

  return {
    summaries,
    totalUnits,
    storeOptions: (stores ?? []).map((s) => ({ id: s.id, name: s.name })),
    generatedAt: new Date().toISOString(),
    lastDataReceivedAt,
  };
}
