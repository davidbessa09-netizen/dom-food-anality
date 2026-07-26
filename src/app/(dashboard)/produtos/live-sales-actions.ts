"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CHANNEL_OPTIONS } from "@/lib/filters/types";
import { formatPaymentMethod } from "@/lib/format/payment-method";
import { isPeriodPreset, resolveCustomPeriod, resolvePeriod, previousPeriod, type PeriodPreset } from "@/lib/dates/period";
import type { SaleItemEvent } from "@/lib/metrics/live-sales";

const EVENT_CAP = 8000;

export interface LiveSalesFilters {
  brandId: string | null;
  storeIds: string[];
  channel: string | null;
  categoryId: string | null;
  periodPreset: string;
  customFrom?: string;
  customTo?: string;
  payment: string | null;
  fulfillment: string | null;
  status: string | null;
  product: string | null;
}

export interface LiveSalesData {
  currentEvents: SaleItemEvent[];
  previousEvents: SaleItemEvent[];
  lastSyncedAt: string | null;
  generatedAt: string;
  productOptions: { id: string; name: string }[];
  categoryOptions: { id: string; name: string }[];
  storeOptions: { id: string; name: string }[];
  truncated: boolean;
}

interface OrderRow {
  id: string;
  ordered_at: string;
  status: string;
  fulfillment_type: string;
  source_platform: string;
  payment_method: string | null;
  store_id: string;
  stores: { name: string } | { name: string }[] | null;
  order_items: { original_name: string; quantity: number; total_price: number; is_addon: boolean }[];
}

async function fetchEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeIds: string[],
  storeNameById: Map<string, string>,
  start: string,
  end: string,
  filters: LiveSalesFilters,
  productNameFilter: Set<string> | null
): Promise<{ events: SaleItemEvent[]; truncated: boolean }> {
  const fallback = ["00000000-0000-0000-0000-000000000000"];
  let query = supabase
    .from("orders")
    .select(
      "id, ordered_at, status, fulfillment_type, source_platform, payment_method, store_id, order_items(original_name, quantity, total_price, is_addon)"
    )
    .in("store_id", storeIds.length ? storeIds : fallback)
    .gte("ordered_at", start)
    .lte("ordered_at", end)
    .order("ordered_at", { ascending: false })
    .limit(EVENT_CAP);

  if (filters.channel) query = query.eq("source_platform", filters.channel);
  if (filters.fulfillment) query = query.eq("fulfillment_type", filters.fulfillment);
  if (filters.payment) query = query.eq("payment_method", filters.payment);
  if (filters.status) query = query.eq("status", filters.status);

  const { data } = await query;
  const rows = (data ?? []) as unknown as OrderRow[];

  const events: SaleItemEvent[] = rows.flatMap((order) =>
    order.order_items
      .filter((item) => !productNameFilter || productNameFilter.has(item.original_name))
      .map((item) => ({
        orderId: order.id,
        orderedAt: order.ordered_at,
        status: order.status,
        storeId: order.store_id,
        storeName: storeNameById.get(order.store_id) ?? "—",
        channel: CHANNEL_OPTIONS.find((o) => o.value === order.source_platform)?.label ?? order.source_platform,
        paymentMethod: order.payment_method ? formatPaymentMethod(order.payment_method) : null,
        fulfillment: order.fulfillment_type,
        productName: item.original_name,
        quantity: item.quantity,
        totalPrice: item.total_price,
        isAddon: item.is_addon,
      }))
  );

  return { events, truncated: rows.length === EVENT_CAP };
}

export async function getLiveSalesData(filters: LiveSalesFilters): Promise<LiveSalesData> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const { data: brands } = await supabase.from("brands").select("id").in("organization_id", orgIds.length ? orgIds : fallback);
  const allBrandIds = (brands ?? []).map((b) => b.id);
  const brandIds = filters.brandId && allBrandIds.includes(filters.brandId) ? [filters.brandId] : allBrandIds;

  const { data: stores } = await supabase.from("stores").select("id, name").in("brand_id", brandIds.length ? brandIds : fallback);
  const allStoreIds = (stores ?? []).map((s) => s.id);
  const selectedStoreIds = filters.storeIds.filter((id) => allStoreIds.includes(id));
  const scopedStoreIds = selectedStoreIds.length > 0 ? selectedStoreIds : allStoreIds;
  const storeNameById = new Map((stores ?? []).map((s) => [s.id, s.name]));

  const { data: categories } = await supabase.from("categories").select("id, canonical_name").in("brand_id", brandIds.length ? brandIds : fallback);
  const { data: products } = await supabase
    .from("products")
    .select("id, canonical_name, category_id")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .order("canonical_name");

  // Correspondência canônica confirmada: quando o usuário filtra por um
  // produto, inclui também as variantes já APROVADAS pra esse produto (nomes
  // diferentes por plataforma), nunca por parecença de texto não confirmada.
  let productNameFilter: Set<string> | null = null;
  if (filters.product) {
    const matchedProduct = (products ?? []).find((p) => p.canonical_name === filters.product);
    const names = new Set<string>([filters.product]);
    if (matchedProduct) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("original_name")
        .eq("product_id", matchedProduct.id)
        .eq("match_status", "aprovado");
      for (const v of variants ?? []) names.add(v.original_name);
    }
    productNameFilter = names;
  }

  const preset: PeriodPreset = isPeriodPreset(filters.periodPreset) ? filters.periodPreset : "hoje";
  const period =
    filters.customFrom && filters.customTo ? resolveCustomPeriod(filters.customFrom, filters.customTo) : resolvePeriod(preset);
  const previous = previousPeriod(period);

  const [current, prev] = await Promise.all([
    fetchEvents(supabase, scopedStoreIds, storeNameById, period.start.toISOString(), period.end.toISOString(), filters, productNameFilter),
    fetchEvents(supabase, scopedStoreIds, storeNameById, previous.start.toISOString(), previous.end.toISOString(), filters, productNameFilter),
  ]);

  // Filtro por categoria: correspondência por nome do produto (mesma
  // convenção simplificada do resto do sistema — ver METRICS_AUDIT.md).
  let currentEvents = current.events;
  let previousEvents = prev.events;
  if (filters.categoryId) {
    const namesInCategory = new Set((products ?? []).filter((p) => p.category_id === filters.categoryId).map((p) => p.canonical_name));
    currentEvents = currentEvents.filter((e) => namesInCategory.has(e.productName));
    previousEvents = previousEvents.filter((e) => namesInCategory.has(e.productName));
  }

  const { data: channelsForSync } = await supabase
    .from("sales_channels")
    .select("id")
    .in("store_id", scopedStoreIds.length ? scopedStoreIds : fallback);
  const channelIdsForSync = (channelsForSync ?? []).map((c) => c.id);
  const { data: integrations } = await supabase
    .from("integrations")
    .select("last_synced_at")
    .in("sales_channel_id", channelIdsForSync.length ? channelIdsForSync : fallback)
    .not("last_synced_at", "is", null)
    .order("last_synced_at", { ascending: false })
    .limit(1);
  const lastSyncedAt = integrations?.[0]?.last_synced_at ?? null;

  return {
    currentEvents,
    previousEvents,
    lastSyncedAt,
    generatedAt: new Date().toISOString(),
    productOptions: (products ?? []).map((p) => ({ id: p.id, name: p.canonical_name })),
    categoryOptions: (categories ?? []).map((c) => ({ id: c.id, name: c.canonical_name })),
    storeOptions: (stores ?? []).map((s) => ({ id: s.id, name: s.name })),
    truncated: current.truncated,
  };
}

export interface ExportLiveSalesParams {
  filters: LiveSalesFilters;
}

export async function exportLiveSalesCsv(params: ExportLiveSalesParams): Promise<{ csv: string; count: number }> {
  const data = await getLiveSalesData(params.filters);

  function csvField(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  const header = ["Data/hora", "Produto", "Quantidade", "Loja", "Canal", "Status", "Pagamento", "Valor"].map(csvField).join(";");
  const lines = data.currentEvents.map((e) =>
    [
      new Date(e.orderedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      e.productName,
      String(e.quantity),
      e.storeName,
      e.channel,
      e.status,
      e.paymentMethod ?? "",
      String(e.totalPrice),
    ]
      .map(csvField)
      .join(";")
  );

  return { csv: [header, ...lines].join("\n"), count: data.currentEvents.length };
}
