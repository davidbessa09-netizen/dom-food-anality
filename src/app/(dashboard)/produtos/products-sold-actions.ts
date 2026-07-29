"use server";

import { createClient } from "@/lib/supabase/server";
import { getLiveSalesData, type LiveSalesFilters } from "./live-sales-actions";
import { syncAnotaAiIntegration } from "@/lib/integrations/anota-ai/sync";
import { tryAcquireSyncLock, releaseSyncLock } from "@/lib/integrations/sync-lock";
import { filterAccountable, filterByWeekday, buildProductSalesSummaries, type SaleItemEvent, type ProductSalesSummary } from "@/lib/metrics/live-sales";

export interface ProductsSoldFilters {
  storeIds: string[];
  periodPreset: string;
  customFrom?: string;
  customTo?: string;
  product: string | null;
  weekday: number | null;
}

export interface ProductsSoldData {
  summaries: ProductSalesSummary[];
  totalUnits: number;
  events: SaleItemEvent[];
  lastSyncedAt: string | null;
  productOptions: { id: string; name: string }[];
  storeOptions: { id: string; name: string }[];
  variantsByProduct: Record<string, { originalName: string; platform: string }[]>;
}

/**
 * Camada bem mais enxuta que [[getLiveSalesData]] pra aba "Produtos
 * vendidos" — reusa a mesma resolução de correspondência canônica e a mesma
 * regra de período (baseada em `ordered_at`, a data REAL da venda, nunca em
 * `synced_at`), mas sem os filtros avançados (canal, categoria, pagamento,
 * tipo, faixa de preço, ativo/inativo) que essa tela não expõe.
 *
 * Importante: NÃO filtra por status="concluido" na consulta — isso deixava
 * "Produtos vendidos" divergente de Vendas → Transações, que por padrão
 * lista pedido de QUALQUER status. Busca todos os status e aplica a mesma
 * regra de "pedido contabilizável" (ver [[filterAccountable]]): tudo que não
 * foi cancelado conta como venda, incluindo pedidos ainda em preparo.
 */
export async function getProductsSoldSummary(filters: ProductsSoldFilters): Promise<ProductsSoldData> {
  const liveSalesFilters: LiveSalesFilters = {
    brandId: null,
    storeIds: filters.storeIds,
    channel: null,
    categoryId: null,
    periodPreset: filters.periodPreset,
    customFrom: filters.customFrom,
    customTo: filters.customTo,
    payment: null,
    fulfillment: null,
    status: null,
    product: filters.product,
    active: null,
    hasPrice: null,
    itemType: "principal",
  };

  const data = await getLiveSalesData(liveSalesFilters);
  const accountableEvents = filterAccountable(data.currentEvents);
  const events = filterByWeekday(accountableEvents, filters.weekday);
  const summaries = buildProductSalesSummaries(events).sort((a, b) => b.quantity - a.quantity);
  const totalUnits = summaries.reduce((sum, s) => sum + s.quantity, 0);

  return {
    summaries,
    totalUnits,
    events,
    lastSyncedAt: data.lastSyncedAt,
    productOptions: data.productOptions,
    storeOptions: data.storeOptions,
    variantsByProduct: data.variantsByProduct,
  };
}

export interface SyncStoresResult {
  ok: boolean;
  ordersProcessed: number;
  lastSyncedAt: string | null;
  errors: string[];
}

/**
 * Sincroniza todas as integrações ativas das lojas no escopo — usada pelo
 * botão "Sincronizar" desta tela (não tem um único integrationId como em
 * /integracoes, porque aqui o escopo é por loja/todas as lojas visíveis).
 *
 * Disputa o MESMO lock (`sync_lock`, ver [[tryAcquireSyncLock]]) que a rota
 * de CRON automática — se um ciclo agendado já estiver em andamento, este
 * botão não roda por cima: retorna "Sincronização já está em andamento."
 * em vez de arriscar gravar por cima do mesmo pedido ao mesmo tempo.
 */
export async function syncStoresNow(storeIds: string[]): Promise<SyncStoresResult> {
  const supabase = await createClient();
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const lockOwner = `manual-${Date.now()}`;
  const acquired = await tryAcquireSyncLock(supabase, lockOwner);
  if (!acquired) {
    return {
      ok: false,
      ordersProcessed: 0,
      lastSyncedAt: null,
      errors: ["Sincronização já está em andamento."],
    };
  }

  try {
    const { data: channels } = await supabase
      .from("sales_channels")
      .select("id")
      .in("store_id", storeIds.length ? storeIds : fallback);
    const channelIds = (channels ?? []).map((c) => c.id);

    const { data: integrations } = await supabase
      .from("integrations")
      .select("id")
      .in("sales_channel_id", channelIds.length ? channelIds : fallback)
      .eq("is_active", true);

    const errors: string[] = [];
    let ordersProcessed = 0;

    for (const integration of integrations ?? []) {
      const result = await syncAnotaAiIntegration(supabase, integration.id, "manual");
      if (result.ok) {
        ordersProcessed += result.ordersProcessed;
      } else if (result.error) {
        errors.push(result.error);
      }
    }

    const integrationIds = (integrations ?? []).map((i) => i.id);
    const { data: refreshedIntegrations } = await supabase
      .from("integrations")
      .select("last_synced_at")
      .in("id", integrationIds.length ? integrationIds : fallback)
      .not("last_synced_at", "is", null)
      .order("last_synced_at", { ascending: false })
      .limit(1);

    return {
      ok: errors.length === 0,
      ordersProcessed,
      lastSyncedAt: refreshedIntegrations?.[0]?.last_synced_at ?? null,
      errors,
    };
  } finally {
    await releaseSyncLock(supabase, lockOwner);
  }
}
