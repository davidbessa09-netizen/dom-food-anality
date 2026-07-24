import type { ConnectionStatus, NormalizedOrder, NormalizedProduct, SourceAdapter, SyncCursor } from "@/lib/integrations/types";
import { toNormalizedAnotaAiOrder } from "./mapping";
import type { AnotaAiListResponse, AnotaAiMenuResponse, AnotaAiOrderResponse } from "./types";

export const ANOTA_AI_CONNECTOR_VERSION = "1.0.0";
export const ANOTA_AI_BASE_URL = "https://api-parceiros.anota.ai/partnerauth";
export const ANOTA_AI_MENU_BASE_URL = "https://api-menu.anota.ai/partnerauth/v2";
export const ANOTA_AI_MENU_EXPORT_PATH = "/nm-category/rest/simple-item/export/v2";

export class AnotaAIAdapter implements SourceAdapter {
  readonly platform = "anota_ai" as const;
  readonly connectorVersion = ANOTA_AI_CONNECTOR_VERSION;

  constructor(
    private readonly token: string,
    private readonly context: { store_id: string; sales_channel_id: string }
  ) {}

  private async request<T>(path: string): Promise<T> {
    return this.requestFrom<T>(ANOTA_AI_BASE_URL, path);
  }

  private async requestFrom<T>(baseUrl: string, path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: this.token },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anota AI respondeu ${res.status}: ${body || res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  async testConnection(): Promise<ConnectionStatus> {
    try {
      const data = await this.request<AnotaAiListResponse>("/ping/list?currentpage=1");
      return { ok: data.success === true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
    }
  }

  /**
   * Busca pedidos via polling (`ping/list` + `ping/get/:id`), conforme
   * documentado — não há filtro de data na API, só por status
   * (inAnalysis/inProduction/inFinished) e paginação. O parâmetro `since` do
   * SyncCursor é aplicado do nosso lado: paramos de processar quando um
   * pedido já sincronizado (source_updated_at <= since) aparecer, mas ainda
   * assim percorremos todas as páginas retornadas pela Anota AI nesta
   * chamada (a API não garante ordenação por data).
   */
  async fetchOrders(params: SyncCursor): Promise<NormalizedOrder[]> {
    const orders: NormalizedOrder[] = [];
    let currentpage = 1;
    const maxPages = 50; // proteção contra loop infinito em caso de resposta inesperada

    while (currentpage <= maxPages) {
      const list = await this.request<AnotaAiListResponse>(`/ping/list?currentpage=${currentpage}`);
      const docs = list.info?.docs ?? [];
      if (docs.length === 0) break;

      for (const doc of docs) {
        if (params.since && doc.updatedAt && doc.updatedAt <= params.since) {
          continue;
        }
        const detail = await this.request<AnotaAiOrderResponse>(`/ping/get/${doc._id}`);
        if (detail.success && detail.info) {
          orders.push(
            toNormalizedAnotaAiOrder(detail.info, {
              store_id: this.context.store_id,
              sales_channel_id: this.context.sales_channel_id,
              connectorVersion: this.connectorVersion,
            })
          );
        }
      }

      const totalPages = Math.ceil((list.info?.count ?? 0) / (list.info?.limit ?? 100));
      if (currentpage >= totalPages) break;
      currentpage++;
    }

    return orders;
  }

  /**
   * Busca o cardápio completo (categorias + itens) via
   * GET https://api-menu.anota.ai/partnerauth/v2/nm-category/rest/simple-item/export/v2
   * — domínio e path diferentes da API de pedidos, mesmo token de
   * autenticação por estabelecimento. Categorias com `is_additional: true`
   * são adicionais/complementos, não itens principais de cardápio.
   */
  async fetchMenu(): Promise<NormalizedProduct[]> {
    const menu = await this.requestFrom<AnotaAiMenuResponse>(ANOTA_AI_MENU_BASE_URL, ANOTA_AI_MENU_EXPORT_PATH);
    if (!menu.success) return [];

    const products: NormalizedProduct[] = [];
    const now = new Date().toISOString();

    for (const category of menu.data ?? []) {
      for (const item of category.itens ?? []) {
        // O preço vem por dia da semana (`week_prices`), não como campo
        // plano — na prática costuma ser igual todos os dias, então usamos
        // o primeiro valor disponível como preço de referência.
        const price = item.week_prices?.[0]?.price;
        products.push({
          source_platform: "anota_ai",
          source_external_id: item.external_id || item.id,
          synced_at: now,
          connector_version: this.connectorVersion,
          sales_channel_id: this.context.sales_channel_id,
          original_name: item.title,
          price,
          category_name: category.is_additional ? undefined : category.title,
        });
      }
    }

    return products;
  }
}
