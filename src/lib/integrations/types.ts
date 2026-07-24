// Formato interno canônico. Todo adaptador (CSV, Anota AI, iFood, tracking
// próprio) converte seus dados para este formato antes de qualquer gravação —
// nenhuma tela ou métrica lê diretamente o formato de origem.
// Ver ARCHITECTURE.md, seção 4.

export type SourcePlatform = "anota_ai" | "ifood" | "csv_import" | "event_tracking";

export interface Provenance {
  source_platform: SourcePlatform;
  source_external_id: string;
  synced_at: string; // ISO
  source_updated_at?: string; // ISO, quando a fonte informar
  connector_version: string;
}

export interface NormalizedOrder extends Provenance {
  store_id: string;
  sales_channel_id: string;
  customer_external_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  status: "criado" | "confirmado" | "em_preparo" | "saiu_para_entrega" | "concluido" | "cancelado";
  fulfillment_type: "entrega" | "retirada" | "consumo_local";
  payment_method?: string;
  gross_amount: number;
  discount_amount: number;
  delivery_fee_amount: number;
  net_amount?: number;
  neighborhood_raw?: string;
  ordered_at: string; // ISO
  confirmed_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  items: NormalizedOrderItem[];
  raw_payload?: Record<string, unknown>;
}

export interface NormalizedOrderItem {
  original_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_addon?: boolean;
}

export interface NormalizedProduct extends Provenance {
  sales_channel_id: string;
  original_name: string;
  price?: number;
  category_name?: string;
}

export interface NormalizedCustomer extends Provenance {
  sales_channel_id: string;
  full_name?: string;
  phone?: string;
  email?: string;
}

export interface NormalizedCancellation extends Provenance {
  order_external_id: string;
  reason?: string;
  refunded_amount?: number;
  cancelled_at: string;
}

export interface SyncCursor {
  since?: string; // ISO — busca apenas registros novos/atualizados a partir daqui
  cursor?: string;
}

export interface ConnectionStatus {
  ok: boolean;
  message?: string;
}

/** Interface comum a todo adaptador de origem de dados (ARCHITECTURE.md §4.1). */
export interface SourceAdapter {
  readonly platform: SourcePlatform;
  readonly connectorVersion: string;

  testConnection?(): Promise<ConnectionStatus>;
  fetchOrders?(params: SyncCursor): Promise<NormalizedOrder[]>;
  fetchProducts?(params: SyncCursor): Promise<NormalizedProduct[]>;
  fetchCustomers?(params: SyncCursor): Promise<NormalizedCustomer[]>;
  fetchCancellations?(params: SyncCursor): Promise<NormalizedCancellation[]>;
}
