import type {
  ConnectorSyncResult,
  ExternalOrganization,
  ExternalPayment,
  ExternalStockMovement,
  ExternalStore,
  IntegrationConnector,
} from "@/lib/integrations/connector";
import { ConnectorNotImplementedError } from "@/lib/integrations/connector";
import type { ConnectionStatus, NormalizedCancellation, NormalizedCustomer, NormalizedOrder, NormalizedProduct, SyncCursor } from "@/lib/integrations/types";
import { BarFacilAdapter, BAR_FACIL_CONNECTOR_VERSION } from "./adapter";
import { isBarFacilEstorno, toNormalizedBarFacilOrder } from "./mapping";
import type { BarFacilConfig } from "./config";

/**
 * Conector do Bar Fácil (BF Play / TicketMais) — implementado a partir da
 * documentação oficial "Api Bar Fácil V2 - Extração de dados" recebida em
 * 2026-08-03. Cobre SOMENTE os endpoints confirmados nessa documentação:
 * eventos, atendentes, produtos, vendas (com fluxo POST/PUT/DELETE de
 * cursor), validacoes, movimento-consumo, movimento-caixa e
 * reimpressao-vendas.
 *
 * Deliberadamente NÃO implementado ainda (métodos continuam lançando
 * [[ConnectorNotImplementedError]]):
 *  - listStockMovements: não existe endpoint de estoque na documentação
 *    recebida (movimento-caixa é operação de caixa, não estoque).
 *  - listPayments/listRefunds como listagem independente: pagamentos só
 *    existem aninhados dentro de cada venda (`venda.pagamentos`); e
 *    estornos são vendas com valor negativo, não uma listagem separada —
 *    ambos já vêm embutidos no retorno de `listSales`.
 *  - Persistência de movimento-consumo/movimento-caixa como faturamento:
 *    confirmado com o Bar Fácil que `movimento-consumo.tipo` 1=recarga e
 *    2=consumo (ver BAR_FACIL_MOVIMENTO_CONSUMO_TIPO em ./types.ts), e que
 *    recargas de saldo aparecem em movimento-caixa (`tipoMovimentacao`).
 *    Mesmo assim, NENHUM dos dois é persistido como pedido/faturamento:
 *    o consumo cashless (tipo=2) já corresponde à mesma venda que chega
 *    completa (com itens e preço) pelo endpoint `vendas` — persistir os
 *    dois duplicaria a mesma venda. `queryMovimentoConsumo`/
 *    `queryMovimentoCaixa` no adapter buscam os dados brutos, tipados, só
 *    pra uso futuro de auditoria/conciliação, nunca como fonte de receita.
 */
export class BarFacilConnector implements IntegrationConnector {
  readonly platform = "bar_facil" as const;
  readonly connectorVersion = BAR_FACIL_CONNECTOR_VERSION;

  private readonly adapter: BarFacilAdapter | null;
  private readonly timezone: string;

  constructor(
    private readonly config: BarFacilConfig,
    token?: string
  ) {
    this.timezone = config.timezone ?? "America/Sao_Paulo";
    this.adapter = token ? new BarFacilAdapter(token, config.environment ?? "producao") : null;
  }

  private requireAdapter(): BarFacilAdapter {
    if (!this.adapter) {
      throw new Error("Nenhum token cadastrado para a integração Bar Fácil.");
    }
    return this.adapter;
  }

  async testConnection(): Promise<ConnectionStatus> {
    if (!this.adapter) {
      return { ok: false, message: "Cadastre o token do Bar Fácil (tela Gestão de Integradores do BF Play) antes de testar." };
    }
    return this.adapter.testConnection();
  }

  async healthCheck(): Promise<ConnectionStatus> {
    try {
      return await this.testConnection();
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Erro desconhecido." };
    }
  }

  /** O Bar Fácil agrupa eventos por empresa — a documentação mostra o
   * objeto `empresa` embutido no evento, mas a API real nem sempre traz
   * esse campo preenchido; tratamos como opcional pra nunca quebrar a
   * listagem por causa de um evento sem empresa associada. */
  async listOrganizations(): Promise<ExternalOrganization[]> {
    const eventos = await this.requireAdapter().listEventos();
    const byId = new Map<string, ExternalOrganization>();
    for (const evento of eventos) {
      if (!evento.empresa) continue;
      byId.set(String(evento.empresa.codEmpresa), { externalId: String(evento.empresa.codEmpresa), name: evento.empresa.razaoSocial });
    }
    return [...byId.values()];
  }

  /** "Evento" é a unidade que mapeamos pra loja (ver barfacil_establishment_links)
   * — o Bar Fácil não tem um conceito de "estabelecimento" separado de
   * evento na documentação recebida. */
  async listStores(): Promise<ExternalStore[]> {
    const eventos = await this.requireAdapter().listEventos();
    return eventos.map((e) => ({
      externalId: String(e.codEvento),
      externalEventId: String(e.codEvento),
      name: e.descricao,
      organizationExternalId: e.empresa ? String(e.empresa.codEmpresa) : undefined,
    }));
  }

  async listProducts(): Promise<NormalizedProduct[]> {
    const produtos = await this.requireAdapter().listProdutos();
    const now = new Date().toISOString();
    return produtos.map((p) => ({
      source_platform: "bar_facil" as const,
      source_external_id: String(p.id),
      synced_at: now,
      connector_version: this.connectorVersion,
      sales_channel_id: "", // preenchido pelo chamador, que sabe o sales_channel da loja
      original_name: p.nome,
      category_name: p.categoria ?? undefined,
    }));
  }

  /** Busca (sem confirmar) — usado por `sync`, que só confirma depois de
   * persistir com sucesso. Chamar isso isolado não avança o cursor do Bar
   * Fácil. */
  async listSales(params: SyncCursor & { storeId?: string }): Promise<NormalizedOrder[]> {
    if (!params.storeId) {
      throw new Error("listSales do Bar Fácil exige storeId (= codEvento) — não há listagem global de vendas.");
    }
    const eventoId = Number(params.storeId);
    const vendas = await this.requireAdapter().queryVendas(eventoId);
    return vendas.map((v) =>
      toNormalizedBarFacilOrder(v, {
        store_id: params.storeId!,
        sales_channel_id: "",
        connectorVersion: this.connectorVersion,
        timezone: this.timezone,
      })
    );
  }

  async listSaleItems(params: SyncCursor & { saleExternalId: string }): Promise<NormalizedOrder["items"]> {
    void params;
    throw new ConnectorNotImplementedError(this.platform, "listSaleItems (itens já vêm embutidos em listSales)");
  }

  async listPayments(params: SyncCursor & { storeId?: string }): Promise<ExternalPayment[]> {
    void params;
    throw new ConnectorNotImplementedError(this.platform, "listPayments (pagamentos já vêm embutidos em listSales)");
  }

  async listRefunds(params: SyncCursor & { storeId?: string }): Promise<NormalizedCancellation[]> {
    if (!params.storeId) {
      throw new Error("listRefunds do Bar Fácil exige storeId (= codEvento).");
    }
    const eventoId = Number(params.storeId);
    const vendas = await this.requireAdapter().queryVendas(eventoId);
    return vendas
      .filter((v) => isBarFacilEstorno(v))
      .map((v) => ({
        source_platform: "bar_facil" as const,
        source_external_id: String(v.codVenda),
        synced_at: new Date().toISOString(),
        connector_version: this.connectorVersion,
        order_external_id: String(v.codVenda),
        cancelled_at: v.dtVenda,
      }));
  }

  async listStockMovements(params: SyncCursor & { storeId?: string }): Promise<ExternalStockMovement[]> {
    void params;
    throw new ConnectorNotImplementedError(this.platform, "listStockMovements (sem endpoint de estoque documentado)");
  }

  async listCustomers(params: SyncCursor & { storeId?: string }): Promise<NormalizedCustomer[]> {
    void params;
    throw new ConnectorNotImplementedError(this.platform, "listCustomers (não documentado)");
  }

  /** Orquestração real fica em bar-facil/sync.ts (precisa de acesso ao
   * Supabase pra persistir e só então confirmar) — este método não é
   * usado diretamente pela rota de cron, mantido só pra satisfazer a
   * interface comum. */
  async sync(trigger: "manual" | "scheduled" | "retry" | "reconciliation", sinceOverride?: string): Promise<ConnectorSyncResult> {
    void trigger;
    void sinceOverride;
    throw new ConnectorNotImplementedError(this.platform, "sync (ver syncBarFacilIntegration em bar-facil/sync.ts)");
  }

  async backfill(params: { from: string; to: string }): Promise<ConnectorSyncResult> {
    void params;
    throw new ConnectorNotImplementedError(this.platform, "backfill");
  }
}
