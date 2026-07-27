"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CHANNEL_OPTIONS } from "@/lib/filters/types";
import { formatPaymentMethod } from "@/lib/format/payment-method";
import { isPeriodPreset, resolveCustomPeriod, resolvePeriod, previousPeriod, type PeriodPreset } from "@/lib/dates/period";
import type { SaleItemEvent } from "@/lib/metrics/live-sales";

const EVENT_CAP = 8000;

export type ItemTypeFilter = "principal" | "adicional" | "all";

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
  minPrice?: string;
  maxPrice?: string;
  active: string | null;
  hasPrice: string | null;
  itemType: ItemTypeFilter;
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
  /** Nomes originais (já resolvidos pro nome canônico quando havia
   * correspondência aprovada) que ainda não têm correspondência confirmada —
   * a tabela exibe esses como "Pendente de unificação", nunca agrupa por
   * parecença de texto sozinha. */
  pendingUnificationNames: string[];
  /** Variações reconhecidas (nome original + plataforma) por produto canônico,
   * usadas no drawer de detalhe do produto. */
  variantsByProduct: Record<string, { originalName: string; platform: string }[]>;
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

interface NameResolution {
  canonicalName: string;
  confirmed: boolean;
}

async function fetchEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeIds: string[],
  storeNameById: Map<string, string>,
  start: string,
  end: string,
  filters: LiveSalesFilters,
  originalNameFilter: Set<string> | null,
  nameResolution: Map<string, NameResolution>
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
      .filter((item) => {
        if (filters.itemType === "principal" && item.is_addon) return false;
        if (filters.itemType === "adicional" && !item.is_addon) return false;
        if (!originalNameFilter) return true;
        return originalNameFilter.has(item.original_name);
      })
      .map((item) => ({
        orderId: order.id,
        orderedAt: order.ordered_at,
        status: order.status,
        storeId: order.store_id,
        storeName: storeNameById.get(order.store_id) ?? "—",
        channel: CHANNEL_OPTIONS.find((o) => o.value === order.source_platform)?.label ?? order.source_platform,
        paymentMethod: order.payment_method ? formatPaymentMethod(order.payment_method) : null,
        fulfillment: order.fulfillment_type,
        productName: nameResolution.get(item.original_name)?.canonicalName ?? item.original_name,
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
    .select("id, canonical_name, category_id, current_price, is_active")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .order("canonical_name");

  const productIds = (products ?? []).map((p) => p.id);
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  // Correspondência canônica: todo item de pedido é agrupado pelo nome
  // original (original_name), a não ser que exista uma variante APROVADA
  // ligando esse nome a um produto canônico — nesse caso agrupa pelo nome
  // canônico. Nunca agrupa automaticamente só por parecença de texto; nomes
  // sem correspondência aprovada ficam marcados como "pendente".
  const { data: allVariants } = await supabase
    .from("product_variants")
    .select("product_id, original_name, match_status, sales_channels(platform)")
    .in("product_id", productIds.length ? productIds : fallback);

  interface VariantRow {
    product_id: string | null;
    original_name: string;
    match_status: string;
    sales_channels: { platform: string } | { platform: string }[] | null;
  }
  const variantRows = (allVariants ?? []) as unknown as VariantRow[];

  const nameResolution = new Map<string, NameResolution>();
  // Identidade: o próprio nome canônico do produto sempre resolve pra si
  // mesmo, já confirmado (é assim que o resto do sistema já casa nome do
  // item com produto, ver METRICS_AUDIT.md).
  for (const p of products ?? []) {
    nameResolution.set(p.canonical_name, { canonicalName: p.canonical_name, confirmed: true });
  }
  const variantsByProduct: Record<string, { originalName: string; platform: string }[]> = {};
  for (const v of variantRows) {
    const platform = Array.isArray(v.sales_channels) ? v.sales_channels[0]?.platform : v.sales_channels?.platform;
    if (v.match_status === "aprovado" && v.product_id) {
      const product = productById.get(v.product_id);
      if (product) {
        nameResolution.set(v.original_name, { canonicalName: product.canonical_name, confirmed: true });
        if (v.original_name !== product.canonical_name) {
          const list = variantsByProduct[product.canonical_name] ?? [];
          list.push({ originalName: v.original_name, platform: platform ?? "—" });
          variantsByProduct[product.canonical_name] = list;
        }
        continue;
      }
    }
    if (!nameResolution.has(v.original_name)) {
      nameResolution.set(v.original_name, { canonicalName: v.original_name, confirmed: false });
    }
  }

  // Correspondência canônica confirmada: quando o usuário filtra por um
  // produto, inclui também os nomes originais já aprovados pra esse produto
  // (nomes diferentes por plataforma), nunca por parecença de texto não
  // confirmada.
  let originalNameFilter: Set<string> | null = null;
  if (filters.product) {
    const names = new Set<string>();
    for (const [originalName, resolution] of nameResolution) {
      if (resolution.canonicalName === filters.product) names.add(originalName);
    }
    names.add(filters.product);
    originalNameFilter = names;
  }

  // Faixa de preço / ativo-inativo / com-sem preço: filtros de catálogo
  // aplicados aqui como recorte adicional sobre os nomes de produto
  // (produtos sem correspondência no catálogo são excluídos quando algum
  // desses filtros está ativo, já que não há como avaliá-los).
  const hasCatalogFilter = Boolean(filters.minPrice || filters.maxPrice || filters.active || filters.hasPrice);
  if (hasCatalogFilter) {
    const allowedNames = new Set<string>();
    for (const p of products ?? []) {
      if (filters.active === "ativo" && !p.is_active) continue;
      if (filters.active === "inativo" && p.is_active) continue;
      if (filters.hasPrice === "com" && p.current_price === null) continue;
      if (filters.hasPrice === "sem" && p.current_price !== null) continue;
      if (filters.minPrice && (p.current_price === null || p.current_price < Number(filters.minPrice))) continue;
      if (filters.maxPrice && (p.current_price === null || p.current_price > Number(filters.maxPrice))) continue;
      allowedNames.add(p.canonical_name);
    }
    if (originalNameFilter) {
      for (const name of [...originalNameFilter]) {
        if (!allowedNames.has(nameResolution.get(name)?.canonicalName ?? name)) originalNameFilter.delete(name);
      }
    } else {
      originalNameFilter = new Set<string>();
      for (const [originalName, resolution] of nameResolution) {
        if (allowedNames.has(resolution.canonicalName)) originalNameFilter.add(originalName);
      }
    }
  }

  const preset: PeriodPreset = isPeriodPreset(filters.periodPreset) ? filters.periodPreset : "hoje";
  const period =
    filters.customFrom && filters.customTo ? resolveCustomPeriod(filters.customFrom, filters.customTo) : resolvePeriod(preset);
  const previous = previousPeriod(period);

  const [current, prev] = await Promise.all([
    fetchEvents(supabase, scopedStoreIds, storeNameById, period.start.toISOString(), period.end.toISOString(), filters, originalNameFilter, nameResolution),
    fetchEvents(supabase, scopedStoreIds, storeNameById, previous.start.toISOString(), previous.end.toISOString(), filters, originalNameFilter, nameResolution),
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

  const pendingUnificationNames = Array.from(nameResolution.entries())
    .filter(([, resolution]) => !resolution.confirmed)
    .map(([, resolution]) => resolution.canonicalName);

  return {
    currentEvents,
    previousEvents,
    lastSyncedAt,
    generatedAt: new Date().toISOString(),
    productOptions: (products ?? []).map((p) => ({ id: p.id, name: p.canonical_name })),
    categoryOptions: (categories ?? []).map((c) => ({ id: c.id, name: c.canonical_name })),
    storeOptions: (stores ?? []).map((s) => ({ id: s.id, name: s.name })),
    truncated: current.truncated,
    pendingUnificationNames,
    variantsByProduct,
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
