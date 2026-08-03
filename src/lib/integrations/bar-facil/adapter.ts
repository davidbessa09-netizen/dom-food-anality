import type { ConnectionStatus } from "@/lib/integrations/types";
import {
  BAR_FACIL_BASE_URLS,
  type BarFacilAtendenteListItem,
  type BarFacilEvento,
  type BarFacilExtractionEndpoint,
  type BarFacilMovimentoCaixa,
  type BarFacilMovimentoConsumo,
  type BarFacilProduto,
  type BarFacilReimpressaoVenda,
  type BarFacilValidacao,
  type BarFacilVenda,
} from "./types";

export const BAR_FACIL_CONNECTOR_VERSION = "1.0.0";

/**
 * Cliente HTTP de baixo nível do Bar Fácil (BF Play / TicketMais) — cobre
 * SOMENTE os endpoints confirmados na documentação oficial recebida em
 * 2026-08-03. Implementa o fluxo de 3 passos descrito no PDF para
 * endpoints de "Extração de dados" (vendas, validacoes, movimento-consumo,
 * movimento-caixa, reimpressao-vendas):
 *   1. POST → consulta (retorna registros a partir do último ID confirmado)
 *   2. PUT  → confirma recebimento (avança o cursor do lado do Bar Fácil)
 *   3. DELETE → reinicia o cursor de um evento, se necessário
 *
 * IMPORTANTE: quem chama `query*` deve só chamar `confirm*` depois de
 * persistir os dados com sucesso — confirmar antes de gravar arrisca
 * perder registros (o Bar Fácil não reenvia o que já foi confirmado).
 */
export class BarFacilAdapter {
  readonly platform = "bar_facil" as const;
  readonly connectorVersion = BAR_FACIL_CONNECTOR_VERSION;

  constructor(
    private readonly token: string,
    private readonly environment: "producao" | "homologacao"
  ) {}

  private get baseUrl(): string {
    return BAR_FACIL_BASE_URLS[this.environment];
  }

  private async request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.token,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    if (!res.ok) {
      const responseBody = await res.text().catch(() => "");
      throw new Error(`Bar Fácil respondeu ${res.status} em ${path}: ${responseBody || res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  /** Nenhum endpoint de "ping" documentado — usa /eventos (leve, sempre
   * disponível) só pra validar que o token autentica. */
  async testConnection(): Promise<ConnectionStatus> {
    try {
      await this.request<BarFacilEvento[]>("POST", "/eventos", {});
      return { ok: true, message: "Conexão validada com sucesso." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Erro desconhecido ao testar a conexão." };
    }
  }

  async listEventos(situacao?: "Ativo" | "Finalizado"): Promise<BarFacilEvento[]> {
    const result = await this.request<BarFacilEvento | BarFacilEvento[]>("POST", "/eventos", situacao ? { situacao } : {});
    return Array.isArray(result) ? result : [result];
  }

  async listAtendentes(): Promise<BarFacilAtendenteListItem[]> {
    return this.request<BarFacilAtendenteListItem[]>("POST", "/atendentes");
  }

  async listProdutos(): Promise<BarFacilProduto[]> {
    return this.request<BarFacilProduto[]>("POST", "/produtos");
  }

  async queryVendas(eventoId: number): Promise<BarFacilVenda[]> {
    return this.queryExtraction<BarFacilVenda>("vendas", eventoId);
  }
  async confirmVendas(eventoId: number): Promise<void> {
    await this.confirmExtraction("vendas", eventoId);
  }

  async queryValidacoes(eventoId: number): Promise<BarFacilValidacao[]> {
    return this.queryExtraction<BarFacilValidacao>("validacoes", eventoId);
  }
  async confirmValidacoes(eventoId: number): Promise<void> {
    await this.confirmExtraction("validacoes", eventoId);
  }

  async queryMovimentoConsumo(eventoId: number): Promise<BarFacilMovimentoConsumo[]> {
    return this.queryExtraction<BarFacilMovimentoConsumo>("movimento-consumo", eventoId);
  }
  async confirmMovimentoConsumo(eventoId: number): Promise<void> {
    await this.confirmExtraction("movimento-consumo", eventoId);
  }

  async queryMovimentoCaixa(eventoId: number): Promise<BarFacilMovimentoCaixa[]> {
    return this.queryExtraction<BarFacilMovimentoCaixa>("movimento-caixa", eventoId);
  }
  async confirmMovimentoCaixa(eventoId: number): Promise<void> {
    await this.confirmExtraction("movimento-caixa", eventoId);
  }

  async queryReimpressaoVendas(eventoId: number): Promise<BarFacilReimpressaoVenda[]> {
    return this.queryExtraction<BarFacilReimpressaoVenda>("reimpressao-vendas", eventoId);
  }
  async confirmReimpressaoVendas(eventoId: number): Promise<void> {
    await this.confirmExtraction("reimpressao-vendas", eventoId);
  }

  /** Reinicia o cursor de um evento — o Bar Fácil volta a retornar os
   * registros desde o início do evento na próxima consulta POST. */
  async resetCursor(endpoint: BarFacilExtractionEndpoint, eventoId: number): Promise<void> {
    await this.request<unknown[]>("DELETE", `/${endpoint}`, { evento: eventoId });
  }

  private async queryExtraction<T>(endpoint: BarFacilExtractionEndpoint, eventoId: number): Promise<T[]> {
    const result = await this.request<T[]>("POST", `/${endpoint}`, { evento: eventoId });
    return Array.isArray(result) ? result : [result];
  }

  private async confirmExtraction(endpoint: BarFacilExtractionEndpoint, eventoId: number): Promise<void> {
    await this.request<unknown>("PUT", `/${endpoint}`, { evento: eventoId });
  }
}
