import type { NormalizedOrder, NormalizedOrderItem } from "@/lib/integrations/types";
import type { AnotaAiOrder } from "./types";

/**
 * Mapeamento de `check` (status da Anota AI) para o status interno.
 * O enum interno é mais grosseiro que o da Anota AI — ver comentários linha
 * a linha. Isso é uma conversão de dados, não uma métrica calculada; não
 * precisa de rótulo de confiança na UI, mas precisa ser transparente no
 * código para quem for depurar divergências de status.
 */
export function mapAnotaAiStatus(check: number): NormalizedOrder["status"] {
  switch (check) {
    case -2: // Agendado aceito
      return "confirmado";
    case 0: // Em análise
      return "criado";
    case 1: // Em produção
      return "em_preparo";
    case 2: // Pronto — não existe estado "pronto" no nosso enum; tratamos
      // como "saiu_para_entrega" (aproximação: pedido avançou além do preparo).
      return "saiu_para_entrega";
    case 3: // Finalizado
      return "concluido";
    case 4: // Cancelado
      return "cancelado";
    case 5: // Negado (não aceito em 15 min) — efetivamente não virou pedido válido
      return "cancelado";
    case 6: // Solicitação de cancelamento — ainda não é cancelamento confirmado,
      // mas não temos um estado "cancelamento solicitado"; tratamos como
      // cancelado e registramos o motivo original em cancellation_reason.
      return "cancelado";
    default:
      return "criado";
  }
}

export function mapAnotaAiFulfillment(type: AnotaAiOrder["type"]): NormalizedOrder["fulfillment_type"] {
  switch (type) {
    case "DELIVERY":
      return "entrega";
    case "TAKE":
      return "retirada";
    case "LOCAL":
      return "consumo_local";
    default:
      return "entrega";
  }
}

function mapItems(order: AnotaAiOrder): NormalizedOrderItem[] {
  const items: NormalizedOrderItem[] = [];
  for (const item of order.items) {
    items.push({
      original_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.total,
    });
    for (const sub of item.subItems ?? []) {
      items.push({
        original_name: `${item.name} — ${sub.name}`,
        quantity: sub.quantity,
        unit_price: sub.unitPrice ?? sub.price ?? 0,
        total_price: sub.totalPrice ?? sub.total ?? 0,
        is_addon: true,
      });
    }
  }
  return items;
}

const CHECK_LABELS: Record<number, string> = {
  [-2]: "Agendado aceito",
  0: "Em análise",
  1: "Em produção",
  2: "Pronto",
  3: "Finalizado",
  4: "Cancelado",
  5: "Negado (não aceito em 15 minutos)",
  6: "Solicitação de cancelamento de pedido",
};

export function toNormalizedAnotaAiOrder(
  order: AnotaAiOrder,
  context: { store_id: string; sales_channel_id: string; connectorVersion: string }
): NormalizedOrder {
  const discountAmount = (order.discounts ?? []).reduce((sum, d) => sum + d.amount, 0);
  const status = mapAnotaAiStatus(order.check);

  return {
    source_platform: "anota_ai",
    source_external_id: order._id,
    synced_at: new Date().toISOString(),
    source_updated_at: order.updatedAt,
    connector_version: context.connectorVersion,
    store_id: context.store_id,
    sales_channel_id: context.sales_channel_id,
    customer_external_id: order.customer?.id ?? undefined,
    customer_name: order.customer?.name ?? undefined,
    customer_phone: order.customer?.phone ?? undefined,
    status,
    fulfillment_type: mapAnotaAiFulfillment(order.type),
    payment_method: order.payments?.[0]?.name,
    gross_amount: order.total,
    discount_amount: discountAmount,
    delivery_fee_amount: order.deliveryFee ?? 0,
    ordered_at: order.createdAt,
    completed_at: status === "concluido" ? order.updatedAt : undefined,
    cancelled_at: status === "cancelado" ? order.updatedAt : undefined,
    cancellation_reason:
      order.check === 5 || order.check === 6 || order.check === 4
        ? CHECK_LABELS[order.check]
        : undefined,
    items: mapItems(order),
    raw_payload: order as unknown as Record<string, unknown>,
  };
}
