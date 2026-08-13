import type { NormalizedOrder, NormalizedOrderItem } from "@/lib/integrations/types";
import type { BarFacilVenda } from "./types";

/** A API real devolve campos numéricos como string (ex.: "64.90",
 * "1.000") — confirmado ao vivo em 2026-08-07, diferente do exemplo em
 * número do PDF. Aceita os dois formatos sem quebrar. */
function toNumber(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

/**
 * "Registros com valores NEGATIVOS são referentes ao tipo ESTORNO" — nota
 * literal da documentação oficial. É o único sinal de cancelamento
 * confirmado; não existe campo de status separado documentado.
 */
export function isBarFacilEstorno(venda: BarFacilVenda): boolean {
  return venda.items.reduce((sum, item) => sum + toNumber(item.vlrItem), 0) < 0;
}

function mapItems(venda: BarFacilVenda): NormalizedOrderItem[] {
  return venda.items.map((item) => ({
    original_name: item.produto.descricao,
    quantity: Math.abs(toNumber(item.qtdItem)),
    unit_price: Math.abs(toNumber(item.vlrItemUnitario)),
    total_price: Math.abs(toNumber(item.vlrItem)),
  }));
}

/** America/Sao_Paulo não observa horário de verão desde 2019 — o offset é
 * SEMPRE -03:00, fixo. Usamos aritmética manual em vez de TZDate/Intl:
 * confirmado ao vivo em 2026-08-13 que TZDate resolve o fuso de forma
 * DIFERENTE (e incorreta — equivalente a nenhum deslocamento) no runtime
 * de produção da Vercel do que localmente, mesma versão do pacote,
 * mesmo código — um risco de inconsistência entre ambientes que a
 * aritmética fixa elimina de vez. */
const BAR_FACIL_FIXED_OFFSET_MINUTES = 180;

/**
 * Bar Fácil não expõe fuso horário por evento na documentação recebida —
 * `dtVenda` vem sem offset ("yyyy-MM-dd HH:mm:ss"). Confirmado ao vivo em
 * 2026-08-12 (comparando com o relógio real do estabelecimento): esse
 * horário é o horário LOCAL do estabelecimento (America/Sao_Paulo por
 * padrão, ver [[BarFacilConfig.timezone]]), não UTC — tratar como UTC
 * direto (bug anterior) deslocava a venda em 3h e podia até jogar vendas
 * de fim de dia pro dia errado nos filtros "Hoje"/"Ontem".
 */
export function parseBarFacilDate(raw: string, timezone: string): string {
  if (timezone !== "America/Sao_Paulo") {
    throw new Error(`parseBarFacilDate: fuso "${timezone}" não suportado — só America/Sao_Paulo (offset fixo -03:00) está implementado.`);
  }
  const [datePart, timePart] = raw.split(" ");
  // Trata os dígitos como se já fossem UTC (sufixo Z) e depois soma o
  // offset — equivale a "interpretar como horário local BRT e converter
  // pra UTC", mas usando só aritmética de Date, sem depender de
  // resolução de timezone pelo runtime.
  const asIfUtc = new Date(`${datePart}T${timePart ?? "00:00:00"}Z`);
  return new Date(asIfUtc.getTime() + BAR_FACIL_FIXED_OFFSET_MINUTES * 60_000).toISOString();
}

export function toNormalizedBarFacilOrder(
  venda: BarFacilVenda,
  context: { store_id: string; sales_channel_id: string; connectorVersion: string; timezone: string }
): NormalizedOrder {
  const estorno = isBarFacilEstorno(venda);
  const grossAmount = Math.abs(venda.items.reduce((sum, item) => sum + toNumber(item.vlrItem), 0));
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
