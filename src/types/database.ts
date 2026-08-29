// Tipos manuais espelhando supabase/schema.sql (Fase 1).
// Quando o projeto Supabase real existir, substituir/complementar por
// `supabase gen types typescript` e manter este arquivo como fallback de dev.

export type UserRole =
  | "admin_geral"
  | "gestor_marca"
  | "gestor_loja"
  | "analista"
  | "somente_leitura"
  | "products_viewer"
  | "vendas_viewer"
  | "colaborador";

export type PlatformType = "anota_ai" | "ifood" | "csv_import" | "event_tracking";

export interface Organization {
  id: string;
  name: string;
  is_demo: boolean;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  brand_id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesChannel {
  id: string;
  store_id: string;
  platform: PlatformType;
  external_store_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserOrganization {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  brand_id: string | null;
  store_id: string | null;
  created_at: string;
}

/** Uma linha = uma aba/módulo liberado pra um usuário "colaborador" (ver
 * migration 0022_colaborador_module_access.sql). Ausência de linha pra um
 * módulo = sem acesso a essa aba, tanto na UI (menu) quanto no middleware
 * (bloqueio real de rota). `module` é a chave do href sem a barra inicial
 * (ver getAllModuleOptions em nav-items.ts), ex.: "vendas", "produtos". */
export interface UserModuleAccess {
  id: string;
  user_id: string;
  organization_id: string;
  module: string;
  created_at: string;
}

/** Dados de identificação/gestão de acesso restrito — login por nome de
 * usuário, sem e-mail exibido na interface (ver migration 0014). */
export interface UserProfile {
  user_id: string;
  username: string;
  display_name: string;
  status: "ativo" | "inativo";
  must_change_password: boolean;
  expires_at: string | null;
  note: string | null;
  failed_login_count: number;
  locked_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface Category {
  id: string;
  brand_id: string;
  canonical_name: string;
  menu_position: number | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  brand_id: string;
  category_id: string | null;
  canonical_name: string;
  current_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type MatchStatus = "pendente" | "sugerido" | "aprovado" | "rejeitado";

export interface ProductVariant {
  id: string;
  product_id: string | null;
  sales_channel_id: string;
  source_external_id: string;
  original_name: string;
  match_status: MatchStatus;
  match_confidence: number | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  organization_id: string;
  full_name: string | null;
  phone_masked: string | null;
  email_masked: string | null;
  phone_hash: string | null;
  email_hash: string | null;
  first_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | "criado"
  | "confirmado"
  | "em_preparo"
  | "saiu_para_entrega"
  | "concluido"
  | "cancelado";
export type OrderFulfillment = "entrega" | "retirada";
export type SyncStatus = "pending" | "running" | "success" | "partial_success" | "failed";

export interface Order {
  id: string;
  store_id: string;
  sales_channel_id: string;
  customer_id: string | null;
  source_platform: PlatformType;
  source_external_id: string;
  status: OrderStatus;
  fulfillment_type: OrderFulfillment;
  payment_method: string | null;
  gross_amount: number;
  discount_amount: number;
  delivery_fee_amount: number;
  net_amount: number | null;
  neighborhood_raw: string | null;
  ordered_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  synced_at: string;
  sync_status: SyncStatus;
  connector_version: string;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_variant_id: string | null;
  original_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_addon: boolean;
  parent_item_id: string | null;
  created_at: string;
}

export type ImportType = "pedidos" | "produtos" | "clientes" | "cancelamentos" | "cardapio" | "financeiro";
export type ImportStatus =
  | "pendente"
  | "processando"
  | "concluido"
  | "concluido_com_erros"
  | "falhou"
  | "desfeito";

export interface Import {
  id: string;
  organization_id: string;
  store_id: string | null;
  import_type: ImportType;
  file_name: string;
  status: ImportStatus;
  column_mapping: Record<string, string> | null;
  rows_total: number;
  rows_imported: number;
  rows_failed: number;
  created_by: string | null;
  undone_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportError {
  id: string;
  import_id: string;
  row_number: number;
  column_name: string | null;
  message: string;
  raw_row: Record<string, unknown> | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Partial<Organization>;
        Update: Partial<Organization>;
        Relationships: [];
      };
      brands: {
        Row: Brand;
        Insert: Partial<Brand>;
        Update: Partial<Brand>;
        Relationships: [];
      };
      stores: {
        Row: Store;
        Insert: Partial<Store>;
        Update: Partial<Store>;
        Relationships: [];
      };
      sales_channels: {
        Row: SalesChannel;
        Insert: Partial<SalesChannel>;
        Update: Partial<SalesChannel>;
        Relationships: [];
      };
      user_organizations: {
        Row: UserOrganization;
        Insert: Partial<UserOrganization>;
        Update: Partial<UserOrganization>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
