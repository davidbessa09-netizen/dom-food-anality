"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePeriod, APP_TIMEZONE, type PeriodPreset } from "@/lib/dates/period";
import { buildViewerProductSummaries, type ViewerProductSummary } from "@/lib/metrics/products-viewer";
import type { SaleItemEvent } from "@/lib/metrics/live-sales";
import { TZDate } from "@date-fns/tz";
import { endOfDay, startOfDay } from "date-fns";

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
 * Status real de sincronização pro perfil restrito. O papel products_viewer
 * não tem select em `integrations` (ver migration 0014) — usar o
 * `created_at` do pedido mais recente como substituto (versão antiga desta
 * função) confundia "sem venda nova há um tempo" com "sincronização
 * falhou": um período parado (ex.: entre picos de movimento) já bastava
 * pra disparar "Falha na atualização automática" mesmo com o ciclo
 * automático rodando perfeitamente a cada 5 minutos.
 *
 * Em vez disso, usa a service role só pra ler `last_synced_at` das
 * integrações ativas ligadas às lojas autorizadas — nenhum outro dado
 * sensível (token, config) é exposto, só o timestamp — e retorna o mais
 * recente entre elas. Fallback pro `created_at` de pedido só quando a
 * loja não tem nenhuma integração ativa (ex.: só importação por CSV).
 */
async function getLastDataReceivedAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeIds: string[]
): Promise<string | null> {
  const fallback = ["00000000-0000-0000-0000-000000000000"];
  const scopedStoreIds = storeIds.length ? storeIds : fallback;

  const service = createServiceClient();
  const timestamps: string[] = [];

  // Integrações com um sales_channel por loja de verdade (Anota AI, CSV) —
  // casam direto pelo canal da loja.
  const { data: channels } = await service.from("sales_channels").select("id").in("store_id", scopedStoreIds);
  const channelIds = (channels ?? []).map((c) => c.id);
  if (channelIds.length > 0) {
    const { data: integrations } = await service
      .from("integrations")
      .select("last_synced_at")
      .in("sales_channel_id", channelIds)
      .eq("is_active", true)
      .not("last_synced_at", "is", null)
      .order("last_synced_at", { ascending: false })
      .limit(1);
    if (integrations?.[0]?.last_synced_at) timestamps.push(integrations[0].last_synced_at);
  }

  // Bar Fácil é uma integração ÚNICA por empresa, não por loja — o
  // `integrations.sales_channel_id` dela aponta pra um canal "placeholder"
  // criado antes de qualquer loja ser vinculada, nunca pro canal real da
  // loja. O vínculo de verdade fica em barfacil_establishment_links.
  const { data: barFacilLinks } = await service
    .from("barfacil_establishment_links")
    .select("store_id")
    .eq("status", "vinculado")
    .in("store_id", scopedStoreIds);
  if (barFacilLinks && barFacilLinks.length > 0) {
    const { data: barFacilIntegration } = await service
      .from("integrations")
      .select("last_synced_at")
      .eq("platform", "bar_facil")
      .eq("is_active", true)
      .not("last_synced_at", "is", null)
      .maybeSingle();
    if (barFacilIntegration?.last_synced_at) timestamps.push(barFacilIntegration.last_synced_at);
  }

  if (timestamps.length > 0) {
    return timestamps.sort().reverse()[0];
  }

  const { data } = await supabase
    .from("orders")
    .select("created_at")
    .in("store_id", scopedStoreIds)
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

export interface ViewerTerminalFilters {
  periodPreset: ViewerPeriodPreset;
  /** Data específica ("yyyy-MM-dd", fuso America/Sao_Paulo) — quando
   * informada, substitui periodPreset por esse dia exato. */
  customDate?: string | null;
  storeIds: string[];
  /** Filtra pelo valor exato de terminal (o mesmo texto retornado em
   * ViewerTerminalSaleRow.terminal) — vazio/undefined = todos. */
  terminal?: string | null;
}

export interface ViewerTerminalSaleRow {
  productName: string;
  quantity: number;
  orderedAt: string;
  terminal: string | null;
}

function resolveViewerPeriod(periodPreset: ViewerPeriodPreset, customDate?: string | null) {
  if (customDate) {
    const day = new TZDate(`${customDate}T00:00:00`, APP_TIMEZONE);
    return { start: startOfDay(day), end: endOfDay(day) };
  }
  return resolvePeriod(periodPreset as PeriodPreset);
}

/** Terminal/caixa que registrou a venda — só o Bar Fácil informa isso hoje
 * (`codTerminal`/`codVendaTerminal` no payload bruto salvo em raw_payload).
 * Outras origens não têm esse dado, então fica ausente. */
function extractTerminal(sourcePlatform: string, rawPayload: Record<string, unknown> | null): string | null {
  if (sourcePlatform !== "bar_facil" || !rawPayload) return null;
  const terminal = rawPayload.codTerminal ?? rawPayload.codVendaTerminal;
  return terminal !== undefined && terminal !== null ? String(terminal) : null;
}

interface ViewerTerminalOrderRow {
  ordered_at: string;
  source_platform: string;
  raw_payload: Record<string, unknown> | null;
  order_items: { original_name: string; quantity: number; is_addon: boolean }[];
}

export interface ViewerTerminalData {
  rows: ViewerTerminalSaleRow[];
  /** Terminais distintos vistos no período/lojas selecionados (antes do
   * filtro de terminal) — pra popular o seletor sem precisar de uma
   * consulta separada. */
  terminalOptions: string[];
}

/**
 * Lista simples "Produto / Horário / Terminal" — sem valor, a pedido
 * explícito da gerência. Uma linha por item de venda (não agregada por
 * produto como a aba principal), pra deixar claro qual terminal vendeu
 * cada item específico. Aceita uma data exata (customDate) em vez do
 * período pré-definido, e um filtro de terminal — ex.: "01/08/26,
 * terminal 89638, produtos vendidos".
 */
export async function getViewerSalesByTerminal(filters: ViewerTerminalFilters): Promise<ViewerTerminalData> {
  const supabase = await createClient();
  const period = resolveViewerPeriod(filters.periodPreset, filters.customDate);

  const { data: stores } = await supabase.from("stores").select("id").eq("is_active", true);
  const authorizedStoreIds = (stores ?? []).map((s) => s.id);
  const scopedStoreIds = filters.storeIds.length > 0 ? filters.storeIds.filter((id) => authorizedStoreIds.includes(id)) : authorizedStoreIds;
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: orders } = await supabase
    .from("orders")
    .select("ordered_at, source_platform, raw_payload, order_items(original_name, quantity, is_addon)")
    .in("store_id", scopedStoreIds.length ? scopedStoreIds : fallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString())
    .order("ordered_at", { ascending: false });

  const rows = (orders ?? []) as unknown as ViewerTerminalOrderRow[];

  const allRows: ViewerTerminalSaleRow[] = rows.flatMap((order) => {
    const terminal = extractTerminal(order.source_platform, order.raw_payload);
    return order.order_items
      .filter((item) => !item.is_addon)
      .map((item) => ({
        productName: item.original_name,
        quantity: item.quantity,
        orderedAt: order.ordered_at,
        terminal,
      }));
  });

  const terminalOptions = [...new Set(allRows.map((r) => r.terminal).filter((t): t is string => !!t))].sort();
  const filteredRows = filters.terminal ? allRows.filter((r) => r.terminal === filters.terminal) : allRows;

  return { rows: filteredRows, terminalOptions };
}
