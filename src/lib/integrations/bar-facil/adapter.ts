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

/** Ver nota em [[BarFacilAdapter.formatDateTime]] — offset fixo, sem
 * depender de resolução de timezone pelo runtime. */
const BAR_FACIL_FIXED_OFFSET_MINUTES = 180;

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
    private readonly environment: "producao" | "homologacao",
    private readonly timezone: string = "America/Sao_Paulo"
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

  /**
   * A documentação em PDF mostra os retornos como array simples, mas a API
   * real de /eventos respondeu com um envelope de paginação estilo Laravel
   * (`{ data: [...], currentPage, total, ... }`) — confirmado ao vivo em
   * 2026-08-06. Esta função aceita qualquer um dos formatos (array puro,
   * envelope paginado com `.data`, ou um único objeto) sem quebrar,
   * garantindo que sempre devolvemos uma lista, mesmo vazia.
   */
  private unwrapList<T>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[];
    if (result && typeof result === "object" && Array.isArray((result as { data?: unknown }).data)) {
      return (result as { data: T[] }).data;
    }
    if (result) return [result as T];
    return [];
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
    const result = await this.request<unknown>("POST", "/eventos", situacao ? { situacao } : {});
    return this.unwrapList<BarFacilEvento>(result);
  }

  async listAtendentes(): Promise<BarFacilAtendenteListItem[]> {
    const result = await this.request<unknown>("POST", "/atendentes");
    return this.unwrapList<BarFacilAtendenteListItem>(result);
  }

  async listProdutos(): Promise<BarFacilProduto[]> {
    const result = await this.request<unknown>("POST", "/produtos");
    return this.unwrapList<BarFacilProduto>(result);
  }

  async queryVendas(eventoId: number): Promise<BarFacilVenda[]> {
    return this.queryExtraction<BarFacilVenda>("vendas", eventoId);
  }
  async confirmVendas(eventoId: number): Promise<void> {
    await this.confirmExtraction("vendas", eventoId);
  }

  /**
   * Filtro alternativo confirmado ao vivo em 2026-08-07: /vendas aceita
   * `dtInicio`/`dtTermino` ("Y-m-d H:i:s") em vez de `evento` — necessário
   * pra estabelecimentos que não usam o conceito de evento no Bar Fácil
   * (ex.: bar fixo com uso diário). Sem cursor do lado do Bar Fácil nesse
   * modo (não há PUT/DELETE documentado pra filtro de data) — o dedup por
   * `codVenda` na persistência garante idempotência mesmo re-buscando a
   * mesma janela de tempo em ciclos seguidos.
   */
  async queryVendasPorPeriodo(dtInicio: Date, dtTermino: Date): Promise<BarFacilVenda[]> {
    const result = await this.request<unknown>("POST", "/vendas", {
      dtInicio: this.formatDateTime(dtInicio),
      dtTermino: this.formatDateTime(dtTermino),
    });
    return this.unwrapList<BarFacilVenda>(result);
  }

  /**
   * BUG CONFIRMADO AO VIVO EM 2026-08-12: `dtInicio`/`dtTermino` (assim como
   * `dtVenda` na resposta) são interpretados pelo Bar Fácil como horário
   * LOCAL do estabelecimento, não UTC. Formatar direto o Date em dígitos
   * UTC (versão original) fazia a API reinterpretar esses dígitos como BRT,
   * empurrando a janela de busca ~3h pra frente do instante real a cada
   * consulta — pulando pra sempre qualquer venda nessa faixa de 3h, ciclo
   * após ciclo.
   *
   * SEGUNDO BUG CONFIRMADO AO VIVO EM 2026-08-13: a versão com TZDate (que
   * corrigia o bug acima) resolvia o fuso de forma diferente — e errada,
   * equivalente a nenhum deslocamento — no runtime de produção da Vercel
   * do que localmente, mesmo pacote/código. Por isso, aritmética manual de
   * offset fixo (America/Sao_Paulo não observa horário de verão desde
   * 2019, sempre -03:00) em vez de TZDate/Intl — ver [[parseBarFacilDate]]
   * em mapping.ts pra mais contexto.
   */
  private formatDateTime(date: Date): string {
    if (this.timezone !== "America/Sao_Paulo") {
      throw new Error(`formatDateTime: fuso "${this.timezone}" não suportado — só America/Sao_Paulo (offset fixo -03:00) está implementado.`);
    }
    const brtInstant = new Date(date.getTime() - BAR_FACIL_FIXED_OFFSET_MINUTES * 60_000);
    return brtInstant.toISOString().slice(0, 19).replace("T", " ");
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
    const result = await this.request<unknown>("POST", `/${endpoint}`, { evento: eventoId });
    return this.unwrapList<T>(result);
  }

  private async confirmExtraction(endpoint: BarFacilExtractionEndpoint, eventoId: number): Promise<void> {
    await this.request<unknown>("PUT", `/${endpoint}`, { evento: eventoId });
  }
}
