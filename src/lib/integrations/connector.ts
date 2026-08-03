import type {
  ConnectionStatus,
  NormalizedCancellation,
  NormalizedCustomer,
  NormalizedOrder,
  NormalizedProduct,
  SourcePlatform,
  SyncCursor,
} from "@/lib/integrations/types";

/**
 * Contrato comum a qualquer novo conector de PDV/gestão de vendas (Bar
 * Fácil, e futuros) — mais amplo que [[SourceAdapter]] (usado hoje só pela
 * Anota AI/CSV), porque conectores de PDV/cashless costumam expor
 * organização → estabelecimento/evento → ponto de venda como entidades
 * próprias, e pagamentos/estornos como listagens separadas dos pedidos.
 *
 * Cada conector concreto (ex.: BarFacilConnector) implementa este
 * contrato usando SOMENTE os campos/endpoints confirmados na
 * documentação oficial da respectiva plataforma — nenhum método aqui
 * prescreve formato de request/response, isso é responsabilidade da
 * implementação concreta.
 */
export interface IntegrationConnector {
  readonly platform: SourcePlatform;
  readonly connectorVersion: string;

  /** Valida as credenciais configuradas contra a API real — nunca deve
   * retornar `ok: true` sem uma resposta de autenticação bem-sucedida. */
  testConnection(): Promise<ConnectionStatus>;

  listOrganizations(): Promise<ExternalOrganization[]>;
  listStores(params?: { organizationId?: string }): Promise<ExternalStore[]>;
  listProducts(params: SyncCursor & { storeId?: string }): Promise<NormalizedProduct[]>;
  listSales(params: SyncCursor & { storeId?: string }): Promise<NormalizedOrder[]>;
  listSaleItems(params: SyncCursor & { saleExternalId: string }): Promise<NormalizedOrder["items"]>;
  listPayments(params: SyncCursor & { storeId?: string }): Promise<ExternalPayment[]>;
  listRefunds(params: SyncCursor & { storeId?: string }): Promise<NormalizedCancellation[]>;
  listStockMovements(params: SyncCursor & { storeId?: string }): Promise<ExternalStockMovement[]>;
  listCustomers?(params: SyncCursor & { storeId?: string }): Promise<NormalizedCustomer[]>;

  /** Sincronização incremental (mesmo papel de syncAnotaAiIntegration). */
  sync(trigger: "manual" | "scheduled" | "retry" | "reconciliation", sinceOverride?: string): Promise<ConnectorSyncResult>;

  /** Importação inicial de um período histórico, sempre validada contra
   * o relatório oficial antes de ativar a sincronização automática (ver
   * seção 12 do brief — nunca importar todo o histórico sem validar). */
  backfill(params: { from: string; to: string }): Promise<ConnectorSyncResult>;

  /** Status leve pro card de Integrações — nunca chama endpoints de
   * escrita, só confirma que a conexão está saudável. Não deve lançar:
   * erros viram `{ ok: false, message }`. */
  healthCheck(): Promise<ConnectionStatus>;
}

export interface ExternalOrganization {
  externalId: string;
  name: string;
}

/** "Estabelecimento" ou "evento" na terminologia do Bar Fácil — o
 * equivalente a uma loja/ponto de venda físico ou temporário. */
export interface ExternalStore {
  externalId: string;
  externalEventId?: string;
  name: string;
  organizationExternalId?: string;
}

export interface ExternalPayment {
  externalId: string;
  saleExternalId: string;
  method: string;
  amount: number;
  status: string;
}

export interface ExternalStockMovement {
  externalId: string;
  productExternalId: string;
  type: "entrada" | "saida" | "ajuste";
  quantity: number;
  occurredAt: string;
}

export interface ConnectorSyncResult {
  ok: boolean;
  salesReceived: number;
  salesInserted: number;
  salesUpdated: number;
  itemsReceived: number;
  itemsInserted: number;
  itemsUpdated: number;
  cancellations: number;
  errors: string[];
}

/** Lançado por todo método de um conector ainda sem documentação/
 * credenciais oficiais confirmadas — nunca deve ser confundido com uma
 * falha transitória de rede (não é retentável por withRetry). */
export class ConnectorNotImplementedError extends Error {
  constructor(platform: SourcePlatform, method: string) {
    super(
      `${platform}: método "${method}" ainda não implementado — aguardando documentação oficial e credenciais de homologação. Nenhum endpoint foi inventado.`
    );
    this.name = "ConnectorNotImplementedError";
  }
}
