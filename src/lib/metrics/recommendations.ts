// Recomendações automáticas (Fase 4) — regras simples sobre métricas JÁ
// calculadas em outras telas (vendas, cancelamentos, produtos, RFM). Nunca
// inventa dado novo: cada recomendação cita o número real que a gerou, e uma
// regra só dispara quando o dado de entrada existe (ausência de dado nunca
// vira recomendação silenciosa).

export type RecommendationSeverity = "alta" | "media" | "baixa";

export interface Recommendation {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  description: string;
}

const SEVERITY_ORDER: Record<RecommendationSeverity, number> = { alta: 0, media: 1, baixa: 2 };

export interface RecommendationInput {
  revenueCurrent: number;
  /** null = não há dado do período anterior pra comparar (ex.: histórico curto). */
  revenuePrevious: number | null;
  /** null = não há pedidos no período pra calcular taxa. */
  cancellationRate: number | null;
  cancelledCount: number;
  topCancelReason: { reason: string; count: number } | null;
  stalledProductsCount: number;
  atRiskCustomersCount: number;
  totalCustomersCount: number;
  minCustomerSample: number;
}

function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (input.revenuePrevious !== null && input.revenuePrevious > 0) {
    const change = (input.revenueCurrent - input.revenuePrevious) / input.revenuePrevious;
    if (change <= -0.15) {
      recommendations.push({
        id: "queda-faturamento",
        severity: change <= -0.3 ? "alta" : "media",
        title: "Faturamento em queda",
        description: `O faturamento caiu ${formatPercent(Math.abs(change))} em relação ao período anterior. Vale checar se alguma loja ou integração parou de sincronizar antes de agir.`,
      });
    }
  }

  if (input.cancellationRate !== null && input.cancellationRate >= 0.1) {
    const reasonText = input.topCancelReason
      ? ` Motivo mais comum: "${input.topCancelReason.reason}" (${input.topCancelReason.count} caso(s)).`
      : "";
    recommendations.push({
      id: "cancelamento-alto",
      severity: input.cancellationRate >= 0.2 ? "alta" : "media",
      title: "Taxa de cancelamento elevada",
      description: `${formatPercent(input.cancellationRate)} dos pedidos do período foram cancelados (${input.cancelledCount} pedido(s)).${reasonText}`,
    });
  }

  if (input.stalledProductsCount > 0) {
    recommendations.push({
      id: "produtos-parados",
      severity: input.stalledProductsCount >= 5 ? "media" : "baixa",
      title: "Produtos do catálogo sem venda no período",
      description: `${input.stalledProductsCount} produto(s) cadastrado(s) não venderam nenhuma unidade no período selecionado. Vale revisar se ainda fazem sentido no cardápio ou se precisam de destaque/promoção.`,
    });
  }

  if (input.totalCustomersCount >= input.minCustomerSample && input.atRiskCustomersCount > 0) {
    recommendations.push({
      id: "clientes-em-risco",
      severity: input.atRiskCustomersCount >= input.totalCustomersCount * 0.3 ? "media" : "baixa",
      title: "Clientes em risco ou perdidos",
      description: `${input.atRiskCustomersCount} de ${input.totalCustomersCount} cliente(s) identificado(s) estão nos segmentos "Em risco" ou "Perdidos" (RFM). Considere uma ação de reengajamento.`,
    });
  }

  return recommendations.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
