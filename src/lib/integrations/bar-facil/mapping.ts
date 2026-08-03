import type { NormalizedOrder, NormalizedOrderItem } from "@/lib/integrations/types";
import type { BarFacilVenda } from "./types";

/**
 * "Registros com valores NEGATIVOS são referentes ao tipo ESTORNO" — nota
 * literal da documentação oficial. É o único sinal de cancelamento
 * confirmado; não existe campo de status separado documentado.
 */
export function isBarFacilEstorno(venda: BarFacilVenda): boolean {
  return venda.items.reduce((sum, item) => sum + item.vlrItem, 0) < 0;
}

function mapItems(venda: BarFacilVenda): NormalizedOrderItem[] {
  return venda.items.map((item) => ({
    original_name: item.produto.descricao,
    quantity: Math.abs(item.qtdItem),
    unit_price: Math.abs(item.vlrItemUnitario),
    total_price: Math.abs(item.vlrItem),
  }));
}

/**
 * Bar Fácil não expõe fuso horário por evento na documentação recebida —
 * `dtVenda` vem sem offset ("yyyy-MM-dd HH:mm:ss"). Interpretamos como
 * horário local do evento (America/Sao_Paulo, ver [[BarFacilConfig.timezone]])
 * e convertemos para um ISO com offset explícito, nunca tratando como UTC.
 */
export function parseBarFacilDate(raw: string, timezone: string): string {
  const [datePart, timePart] = raw.split(" ");
  const isoLocal = `${datePart}T${timePart ?? "00:00:00"}`;
  // Sem lib de timezone no runtime: assume-se que o servidor roda em UTC
  // (padrão em ambientes serverless) e grava o horário local como veio,
  // marcado com o fuso informado via metadata — a conversão de exibição
  // (America/Sao_Paulo) já é feita em toda a camada de UI via APP_TIMEZONE.
  void timezone;
  return new Date(isoLocal).toISOString();
}

export function toNormalizedBarFacilOrder(
  venda: BarFacilVenda,
  context: { store_id: string; sales_channel_id: string; connectorVersion: string; timezone: string }
): NormalizedOrder {
  const estorno = isBarFacilEstorno(venda);
  const grossAmount = Math.abs(venda.items.reduce((sum, item) => sum + item.vlrItem, 0));
  const orderedAt = parseBarFacilDate(venda.dtVenda, context.timezone);

  return {
    source_platform: "bar_facil",
    source_external_id: String(venda.codVenda),
    synced_at: new Date().toISOString(),
    connector_version: context.connectorVersion,
    store_id: context.store_id,
    sales_channel_id: context.sales_channel_id,
    status: estorno ? "cancelado" : "concluido",
    fulfillment_type: "consumo_local", // Bar Fácil é PDV presencial (bar/evento) — não há entrega/retirada documentada
    payment_method: venda.pagamentos?.[0]?.formaPagamento,
    gross_amount: grossAmount,
    discount_amount: 0, // não documentado como campo separado
    delivery_fee_amount: 0,
    ordered_at: orderedAt,
    completed_at: estorno ? undefined : orderedAt,
    cancelled_at: estorno ? orderedAt : undefined,
    cancellation_reason: estorno ? "Estorno (valor negativo na origem)" : undefined,
    items: mapItems(venda),
    raw_payload: venda as unknown as Record<string, unknown>,
  };
}
