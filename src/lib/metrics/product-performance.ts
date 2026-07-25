// Classificação de "baixa saída" (ver METRICS_AUDIT.md) — usa histórico
// COMPLETO (não só o período selecionado) pra "nunca vendeu"/"não vende há X
// dias", e o período selecionado só pra "vendeu pouco" (quantidade baixa
// AGORA). Produtos inativos, adicional-only ou duplicados nunca competem
// nessas categorias — são excluídos e contados à parte, pra não tratar
// ausência estrutural de venda como mau desempenho.

export type LowPerformerReason = "nunca_vendeu" | "sem_venda_recente" | "vendeu_pouco";

export interface CatalogProductInput {
  id: string;
  canonical_name: string;
  is_active: boolean;
  created_at: string; // ISO
}

export interface AllTimeSalesInfo {
  name: string;
  lastSoldAt: string | null; // null = nunca vendeu (em todo o histórico)
  totalQuantity: number;
}

export interface LowPerformerRow {
  id: string;
  name: string;
  reason: LowPerformerReason;
  periodQuantity: number;
  daysSinceLastSale: number | null;
  suggestedAction: string;
}

export interface ExcludedProductInfo {
  id: string;
  name: string;
  reason: "inativo" | "adicional" | "duplicado";
}

export interface ClassifyLowPerformersResult {
  rows: LowPerformerRow[];
  excluded: ExcludedProductInfo[];
  insufficientSample: { id: string; name: string }[];
}

export function classifyLowPerformers(params: {
  products: CatalogProductInput[];
  periodQuantityByName: Map<string, number>;
  allTimeSalesByName: Map<string, AllTimeSalesInfo>;
  addonOnlyNames: Set<string>;
  duplicateNames: Set<string>;
  now: string;
  minSampleDays: number;
  lowQuantityThreshold: number;
  staleDaysThreshold: number;
}): ClassifyLowPerformersResult {
  const {
    products,
    periodQuantityByName,
    allTimeSalesByName,
    addonOnlyNames,
    duplicateNames,
    now,
    minSampleDays,
    lowQuantityThreshold,
    staleDaysThreshold,
  } = params;

  const nowMs = new Date(now).getTime();
  const rows: LowPerformerRow[] = [];
  const excluded: ExcludedProductInfo[] = [];
  const insufficientSample: { id: string; name: string }[] = [];

  for (const product of products) {
    if (!product.is_active) {
      excluded.push({ id: product.id, name: product.canonical_name, reason: "inativo" });
      continue;
    }
    if (addonOnlyNames.has(product.canonical_name)) {
      excluded.push({ id: product.id, name: product.canonical_name, reason: "adicional" });
      continue;
    }
    if (duplicateNames.has(product.canonical_name)) {
      excluded.push({ id: product.id, name: product.canonical_name, reason: "duplicado" });
      continue;
    }

    const ageDays = Math.floor((nowMs - new Date(product.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays < minSampleDays) {
      insufficientSample.push({ id: product.id, name: product.canonical_name });
      continue;
    }

    const sales = allTimeSalesByName.get(product.canonical_name);
    const periodQuantity = periodQuantityByName.get(product.canonical_name) ?? 0;

    if (!sales || sales.lastSoldAt === null) {
      rows.push({
        id: product.id,
        name: product.canonical_name,
        reason: "nunca_vendeu",
        periodQuantity,
        daysSinceLastSale: null,
        suggestedAction: "Nunca vendeu — considere remover do cardápio ou testar uma promoção de lançamento.",
      });
      continue;
    }

    const daysSinceLastSale = Math.floor((nowMs - new Date(sales.lastSoldAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLastSale > staleDaysThreshold) {
      rows.push({
        id: product.id,
        name: product.canonical_name,
        reason: "sem_venda_recente",
        periodQuantity,
        daysSinceLastSale,
        suggestedAction: `Parado há ${daysSinceLastSale} dia(s) — verifique se ainda está disponível/visível no cardápio.`,
      });
      continue;
    }

    if (periodQuantity <= lowQuantityThreshold) {
      rows.push({
        id: product.id,
        name: product.canonical_name,
        reason: "vendeu_pouco",
        periodQuantity,
        daysSinceLastSale,
        suggestedAction: "Vendeu pouco no período — avalie preço, posição no cardápio ou combo com um produto popular.",
      });
    }
  }

  return { rows, excluded, insufficientSample };
}
