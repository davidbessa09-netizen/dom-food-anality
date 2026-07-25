// Regras determinísticas/estatísticas do Painel de Inteligência e
// Oportunidades (/recomendacoes). Cada função aqui é pura: recebe dados JÁ
// calculados por outras telas (nunca acessa banco) e devolve um rascunho de
// oportunidade ou null quando a condição não se aplica. Nenhuma regra
// inventa métrica: quando um dado necessário não existe no sistema (estoque,
// CAC, margem, visualizações de cardápio), a regra correspondente não roda —
// ver `MISSING_DATA_CATEGORIES` na tela, que explica o motivo em vez de
// fabricar um número.
//
// origin_type nunca é "IA": este sistema não chama nenhum modelo generativo
// pra produzir as oportunidades, só regras e estatística (percentil RFM).

export type OpportunityCategory = "receita" | "produtos" | "clientes" | "operacao" | "qualidade_dados";
export type OpportunityPriority = "critica" | "alta" | "media" | "baixa";
export type OpportunityOrigin = "regra_deterministica" | "modelo_estatistico";

export interface OpportunityDraft {
  ruleKey: string;
  category: OpportunityCategory;
  subcategory: string;
  title: string;
  description: string;
  priority: OpportunityPriority;
  originType: OpportunityOrigin;
  originExplanation: string;
  evidence: { label: string; value: string }[];
  affectedBrands: string[];
  expectedImpact: string[];
  suggestedAction: string;
  score: number;
  scoreExplanation: string;
  dashboardLink: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatPercent(value: number): string {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const DROP_THRESHOLD = 0.1;

export function buildRevenueDropOpportunity(input: {
  brandId: string;
  brandName: string;
  current: number;
  previous: number;
}): OpportunityDraft | null {
  if (input.previous <= 0) return null;
  const growth = (input.current - input.previous) / input.previous;
  if (growth > -DROP_THRESHOLD) return null;
  const dropPct = -growth;
  const priority: OpportunityPriority = dropPct >= 0.3 ? "critica" : dropPct >= 0.15 ? "alta" : "media";
  const score = Math.min(100, Math.round(dropPct * 200));

  return {
    ruleKey: "queda_faturamento",
    category: "receita",
    subcategory: "Queda de faturamento",
    title: `Faturamento em queda em ${input.brandName}`,
    description: `O faturamento do período caiu ${formatPercent(dropPct)} em relação ao período anterior de mesma duração.`,
    priority,
    originType: "regra_deterministica",
    originExplanation: "Gerada por regra determinística: comparação de faturamento bruto entre o período atual e o anterior de mesma duração.",
    evidence: [
      { label: "Faturamento no período", value: formatCurrency(input.current) },
      { label: "Faturamento no período anterior", value: formatCurrency(input.previous) },
      { label: "Variação", value: `-${formatPercent(dropPct)}` },
    ],
    affectedBrands: [input.brandName],
    expectedImpact: ["Identificação antecipada de queda de receita", "Possibilidade de ação antes do fechamento do período"],
    suggestedAction: "Verificar se alguma loja ou integração parou de sincronizar antes de agir; comparar com sazonalidade histórica.",
    score,
    scoreExplanation: `Score proporcional à queda percentual (${formatPercent(dropPct)} × 200, limitado a 100).`,
    dashboardLink: "/dashboard",
  };
}

export function buildStaleProductsOpportunity(input: {
  brandId: string;
  brandName: string;
  staleCount: number;
  neverSoldCount: number;
  totalCatalogCount: number;
  avgCatalogPrice: number | null;
  staleDaysThreshold: number;
}): OpportunityDraft | null {
  const affectedCount = input.staleCount + input.neverSoldCount;
  if (affectedCount === 0 || input.totalCatalogCount === 0) return null;
  const share = affectedCount / input.totalCatalogCount;
  const priority: OpportunityPriority = share >= 0.3 ? "alta" : share >= 0.15 ? "media" : "baixa";
  const score = Math.min(100, Math.round(share * 150));

  const evidence = [
    { label: "Produtos sem venda recente ou nunca vendidos", value: String(affectedCount) },
    { label: "Participação no catálogo", value: formatPercent(share) },
    { label: "Limite de dias parado considerado", value: `${input.staleDaysThreshold} dias` },
  ];
  if (input.avgCatalogPrice !== null) {
    evidence.push({ label: "Preço médio cadastrado destes produtos", value: formatCurrency(input.avgCatalogPrice) });
  }

  return {
    ruleKey: "produtos_sem_venda",
    category: "produtos",
    subcategory: "Produtos sem venda",
    title: `${affectedCount} produto(s) sem venda em ${input.brandName}`,
    description: `${affectedCount} produto(s) ativo(s) do catálogo (${formatPercent(share)} do total) não venderam recentemente ou nunca venderam — já excluindo produtos inativos, adicionais, duplicados ou recém-cadastrados (ver aba Baixa saída em Produtos).`,
    priority,
    originType: "regra_deterministica",
    originExplanation: "Gerada por regra determinística: classificação de baixa saída (nunca vendeu / parado há muito tempo), com amostra mínima e exclusões já aplicadas.",
    evidence,
    affectedBrands: [input.brandName],
    expectedImpact: ["Redução da complexidade do cardápio", "Redução de itens parados na análise", "Maior exposição dos produtos estratégicos"],
    suggestedAction: "Revisar produtos parados há mais tempo primeiro; considerar promoção, reposicionamento no cardápio ou descontinuação.",
    score,
    scoreExplanation: `Score proporcional à participação no catálogo (${formatPercent(share)} × 150, limitado a 100).`,
    dashboardLink: "/produtos?tab=baixa-saida",
  };
}

export function buildDuplicateCategoriesOpportunity(input: {
  brandId: string;
  brandName: string;
  exactGroupCount: number;
  totalDuplicateCategoryCount: number;
}): OpportunityDraft | null {
  if (input.exactGroupCount === 0) return null;
  return {
    ruleKey: "categorias_duplicadas",
    category: "qualidade_dados",
    subcategory: "Categorias duplicadas",
    title: `${input.exactGroupCount} grupo(s) de categoria duplicada em ${input.brandName}`,
    description: `${input.totalDuplicateCategoryCount} categoria(s) cadastrada(s) com o mesmo nome (ignorando caixa/acento/espaço) — fragmentam faturamento e contagem de produtos entre registros que deveriam ser um só.`,
    priority: input.exactGroupCount >= 3 ? "media" : "baixa",
    originType: "regra_deterministica",
    originExplanation: "Gerada por regra determinística: normalização de nome (minúsculas, sem acento, espaços colapsados) e agrupamento por marca.",
    evidence: [
      { label: "Grupos de duplicata exata", value: String(input.exactGroupCount) },
      { label: "Categorias envolvidas", value: String(input.totalDuplicateCategoryCount) },
    ],
    affectedBrands: [input.brandName],
    expectedImpact: ["Faturamento por categoria mais confiável", "Cardápio mais organizado"],
    suggestedAction: "Mesclar as categorias duplicadas escolhendo um nome canônico (ver Categorias → Possíveis duplicatas).",
    score: Math.min(100, input.exactGroupCount * 20),
    scoreExplanation: `Score = 20 pontos por grupo de duplicata, limitado a 100.`,
    dashboardLink: "/categorias",
  };
}

export function buildDuplicateProductsOpportunity(input: {
  brandId: string;
  brandName: string;
  duplicateGroupCount: number;
  duplicateProductCount: number;
}): OpportunityDraft | null {
  if (input.duplicateGroupCount === 0) return null;
  return {
    ruleKey: "produtos_duplicados",
    category: "qualidade_dados",
    subcategory: "Produtos duplicados",
    title: `${input.duplicateGroupCount} grupo(s) de produto duplicado em ${input.brandName}`,
    description: `${input.duplicateProductCount} produto(s) cadastrado(s) com o mesmo nome na mesma marca — fragmentam o ranking de vendas entre registros que deveriam ser um só.`,
    priority: input.duplicateGroupCount >= 5 ? "media" : "baixa",
    originType: "regra_deterministica",
    originExplanation: "Gerada por regra determinística: mesmo critério de normalização de nome usado para categorias duplicadas.",
    evidence: [
      { label: "Grupos de produto duplicado", value: String(input.duplicateGroupCount) },
      { label: "Produtos envolvidos", value: String(input.duplicateProductCount) },
    ],
    affectedBrands: [input.brandName],
    expectedImpact: ["Ranking de produtos mais confiável", "Faturamento por produto consolidado corretamente"],
    suggestedAction: "Revisar e consolidar os produtos duplicados no catálogo (Produtos → Catálogo).",
    score: Math.min(100, input.duplicateGroupCount * 10),
    scoreExplanation: "Score = 10 pontos por grupo de duplicata, limitado a 100.",
    dashboardLink: "/produtos?tab=catalogo",
  };
}

export function buildCustomersAtRiskOpportunity(input: {
  brandId: string;
  brandName: string;
  atRiskCount: number;
  totalCustomers: number;
  minSample: number;
}): OpportunityDraft | null {
  if (input.totalCustomers < input.minSample || input.atRiskCount === 0) return null;
  const share = input.atRiskCount / input.totalCustomers;
  const priority: OpportunityPriority = share >= 0.3 ? "alta" : "media";

  return {
    ruleKey: "clientes_em_risco",
    category: "clientes",
    subcategory: "Clientes em risco ou perdidos",
    title: `${input.atRiskCount} cliente(s) em risco ou perdido(s) em ${input.brandName}`,
    description: `${input.atRiskCount} de ${input.totalCustomers} cliente(s) identificado(s) (${formatPercent(share)}) estão nos segmentos RFM "Em risco" ou "Perdidos".`,
    priority,
    originType: "modelo_estatistico",
    originExplanation: "Gerada por modelo estatístico: segmentação RFM (percentil de recência/frequência/valor sobre a base atual de clientes).",
    evidence: [
      { label: "Clientes em risco ou perdidos", value: String(input.atRiskCount) },
      { label: "Total de clientes identificados", value: String(input.totalCustomers) },
      { label: "Participação", value: formatPercent(share) },
    ],
    affectedBrands: [input.brandName],
    expectedImpact: ["Possível recuperação de clientes antes da perda definitiva", "Maior recorrência de compra"],
    suggestedAction: "Criar ação de reengajamento (cupom, contato direto) para os clientes destes segmentos.",
    score: Math.min(100, Math.round(share * 150)),
    scoreExplanation: `Score proporcional à participação de clientes em risco (${formatPercent(share)} × 150, limitado a 100).`,
    dashboardLink: "/clientes?segment=Em risco",
  };
}

export function buildCancellationRateOpportunity(input: {
  brandId: string;
  brandName: string;
  cancellationRate: number;
  cancelledCount: number;
  totalOrders: number;
  topReason: string | null;
}): OpportunityDraft | null {
  if (input.cancellationRate < 0.1) return null;
  const priority: OpportunityPriority = input.cancellationRate >= 0.2 ? "critica" : "alta";
  return {
    ruleKey: "cancelamento_alto",
    category: "operacao",
    subcategory: "Taxa de cancelamento elevada",
    title: `Cancelamento elevado em ${input.brandName}`,
    description: `${formatPercent(input.cancellationRate)} dos pedidos do período foram cancelados (${input.cancelledCount} de ${input.totalOrders}).${input.topReason ? ` Motivo mais comum: "${input.topReason}".` : ""}`,
    priority,
    originType: "regra_deterministica",
    originExplanation: "Gerada por regra determinística: taxa de cancelamento acima de 10% no período.",
    evidence: [
      { label: "Pedidos cancelados", value: String(input.cancelledCount) },
      { label: "Total de pedidos", value: String(input.totalOrders) },
      { label: "Taxa de cancelamento", value: formatPercent(input.cancellationRate) },
      ...(input.topReason ? [{ label: "Motivo mais comum", value: input.topReason }] : []),
    ],
    affectedBrands: [input.brandName],
    expectedImpact: ["Redução de perda de faturamento por cancelamento", "Melhora na experiência do cliente"],
    suggestedAction: "Investigar o motivo mais comum de cancelamento por loja/horário (ver Cancelamentos).",
    score: Math.min(100, Math.round(input.cancellationRate * 300)),
    scoreExplanation: `Score proporcional à taxa de cancelamento (${formatPercent(input.cancellationRate)} × 300, limitado a 100).`,
    dashboardLink: "/cancelamentos",
  };
}
