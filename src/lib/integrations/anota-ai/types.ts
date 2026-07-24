// Tipos do payload bruto da Anota AI, conforme documentação oficial
// (anota-ai.stoplight.io, página "Order model") e testes reais contra
// https://api-parceiros.anota.ai — ver INTEGRATIONS.md para o histórico
// completo da verificação.

export interface AnotaAiListItem {
  _id: string;
  check: number;
  from?: string;
  salesChannel?: string;
  updatedAt?: string;
}

export interface AnotaAiListResponse {
  success: boolean;
  info: {
    docs: AnotaAiListItem[];
    count: number;
    limit: number;
    currentpage: number;
  };
}

export interface AnotaAiSubItem {
  name: string;
  quantity: number;
  totalPrice?: number;
  unitPrice?: number;
  new_totalPrice?: number;
  new_unitPrice?: number;
  externalCode?: string;
  quantityFraction?: number;
  valueFraction?: number;
  price?: number;
  total?: number;
}

export interface AnotaAiItem {
  _id: string;
  id: number;
  name: string;
  quantity: number;
  externalId?: string;
  internalId?: string;
  price: number;
  total: number;
  subItems?: AnotaAiSubItem[];
}

export interface AnotaAiPayment {
  name: string;
  code: string;
  value: string;
  cardSelected?: string;
  externalId?: string;
  changeFor?: string | null;
  prepaid?: boolean;
}

export interface AnotaAiCustomer {
  id: string | null;
  name: string | null;
  phone: string | null;
  taxPayerIdentificationNumber?: string | null;
}

export interface AnotaAiDeliveryAddress {
  formattedAddress?: string;
  country?: string;
  state?: string;
  city?: string;
  coordinates?: { latitude: number; longitude: number };
  neighborhood?: string | null;
  streetName?: string;
  streetNumber?: string;
  postalCode?: string;
  reference?: string;
  complement?: string;
}

export interface AnotaAiOrder {
  _id: string;
  id: string;
  check: number;
  additionalFees?: { type: string; description: string; value: number }[];
  customer: AnotaAiCustomer;
  deliveryFee: number;
  discounts?: { amount: number; tag: string }[];
  items: AnotaAiItem[];
  menu_version?: number;
  merchant: { id: string; name: string | null; unit: string };
  observation?: string | null;
  payments: AnotaAiPayment[];
  pdv?: { status: boolean; mode?: number; table?: string; ticket?: string };
  preparationStartDateTime?: string;
  qr_description?: string;
  salesChannel?: string;
  shortReference: number;
  total: number;
  type: "TAKE" | "DELIVERY" | "LOCAL";
  ifood_id?: string;
  createdAt: string;
  updatedAt: string;
  order_automatic_accept?: boolean;
  deliveryAddress?: AnotaAiDeliveryAddress;
}

export interface AnotaAiOrderResponse {
  success: boolean;
  info: AnotaAiOrder;
}

/** Filtros de status aceitos pelo GET /partnerauth/ping/list (combináveis). */
export interface AnotaAiListFilters {
  currentpage?: number;
  inAnalysis?: boolean;
  inProduction?: boolean;
  inFinished?: boolean;
}

// Schema real de GET https://api-menu.anota.ai/partnerauth/v2/nm-category/rest/simple-item/export/v2
// (colado pelo usuário a partir da documentação — ver INTEGRATIONS.md).

export interface AnotaAiMenuItemNextStep {
  category_title: string;
  category_id: string;
}

export interface AnotaAiMenuWeekPrice {
  price: number;
  short_name: string;
}

export interface AnotaAiMenuItem {
  id: string;
  title: string;
  week_prices?: AnotaAiMenuWeekPrice[];
  max?: number;
  out?: boolean; // true = item fora de estoque no momento da exportação
  external_id?: string;
  next_steps?: AnotaAiMenuItemNextStep[]; // encadeamento pra adicionais/combos
}

export interface AnotaAiMenuCategory {
  title: string;
  id: string;
  itens: AnotaAiMenuItem[];
  is_additional?: boolean; // true = categoria de adicionais/complementos, não item principal de cardápio
}

/** Resposta real de GET .../nm-category/rest/simple-item/export/v2 — o
 * campo raiz é `data`, não `categories` (verificado via chamada real). */
export interface AnotaAiMenuResponse {
  success: boolean;
  message: string;
  data: AnotaAiMenuCategory[];
}
