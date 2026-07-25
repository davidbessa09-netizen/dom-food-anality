"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit/log";
import { resolvePeriod, previousPeriod } from "@/lib/dates/period";
import { grossRevenue, cancellationRate, cancelledOrdersCount, totalOrders, type OrderMetricInput } from "@/lib/metrics/orders";
import { classifyLowPerformers, type AllTimeSalesInfo } from "@/lib/metrics/product-performance";
import { buildProductRanking } from "@/lib/metrics/products";
import { findDuplicateProducts, findDuplicateCategories } from "@/lib/metrics/data-quality";
import { findExactDuplicateGroups } from "@/lib/metrics/category-duplicates";
import { buildRfmSegmentation, computeCustomerStats, type CustomerOrderInput } from "@/lib/metrics/rfm";
import { cancellationsByReason, type CancelledOrderInput } from "@/lib/metrics/cancellations";
import {
  buildRevenueDropOpportunity,
  buildStaleProductsOpportunity,
  buildDuplicateCategoriesOpportunity,
  buildDuplicateProductsOpportunity,
  buildCustomersAtRiskOpportunity,
  buildCancellationRateOpportunity,
  type OpportunityDraft,
} from "@/lib/intelligence/opportunity-rules";
import type { Brand } from "@/types/database";

const MIN_SAMPLE_DAYS = 14;
const LOW_QUANTITY_THRESHOLD = 3;
const STALE_DAYS_THRESHOLD = 30;
const MIN_CUSTOMER_SAMPLE = 10;

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

/**
 * Reexecuta todas as regras e grava em `opportunities` — nunca sobrescreve
 * status/responsável/prazo de uma oportunidade já existente (só evidência,
 * score, título e descrição), pra não perder o trabalho de quem já está
 * tratando o caso. Rodada explicitamente (botão "Atualizar"), não a cada
 * carregamento de página.
 */
export async function refreshOpportunities(): Promise<SimpleResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  if (orgIds.length === 0) return { ok: false, error: "Nenhuma organização vinculada." };

  const fallback = ["00000000-0000-0000-0000-000000000000"];
  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds)
    .returns<Brand[]>();

  const period = resolvePeriod("30d");
  const previous = previousPeriod(period);
  const now = new Date().toISOString();

  for (const brand of brands ?? []) {
    const drafts: OpportunityDraft[] = [];

    const { data: stores } = await supabase.from("stores").select("id").eq("brand_id", brand.id);
    const storeIds = (stores ?? []).map((s) => s.id);
    const storeFallback = storeIds.length ? storeIds : fallback;

    // Receita: queda de faturamento.
    const { data: currentOrdersRaw } = await supabase
      .from("orders")
      .select("id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id")
      .in("store_id", storeFallback)
      .gte("ordered_at", period.start.toISOString())
      .lte("ordered_at", period.end.toISOString());
    const { data: previousOrdersRaw } = await supabase
      .from("orders")
      .select("id, status, gross_amount, net_amount, discount_amount, delivery_fee_amount, customer_id")
      .in("store_id", storeFallback)
      .gte("ordered_at", previous.start.toISOString())
      .lte("ordered_at", previous.end.toISOString());
    const currentOrders = (currentOrdersRaw ?? []) as OrderMetricInput[];
    const previousOrders = (previousOrdersRaw ?? []) as OrderMetricInput[];

    const revenueDrop = buildRevenueDropOpportunity({
      brandId: brand.id,
      brandName: brand.name,
      current: grossRevenue(currentOrders),
      previous: grossRevenue(previousOrders),
    });
    if (revenueDrop) drafts.push(revenueDrop);

    // Operação: cancelamento.
    const { data: cancelledRaw } = await supabase
      .from("orders")
      .select("id, store_id, gross_amount, ordered_at, cancellations(reason)")
      .in("store_id", storeFallback)
      .eq("status", "cancelado")
      .gte("ordered_at", period.start.toISOString())
      .lte("ordered_at", period.end.toISOString());
    interface CancelledRaw {
      id: string;
      store_id: string;
      gross_amount: number;
      ordered_at: string;
      cancellations: { reason: string | null }[] | { reason: string | null } | null;
    }
    const cancelledOrders: CancelledOrderInput[] = ((cancelledRaw ?? []) as unknown as CancelledRaw[]).map((o) => {
      const c = Array.isArray(o.cancellations) ? o.cancellations[0] : o.cancellations;
      return { id: o.id, store_id: o.store_id, gross_amount: o.gross_amount, ordered_at: o.ordered_at, reason: c?.reason ?? null };
    });
    const topReason = cancellationsByReason(cancelledOrders)[0]?.reason ?? null;
    const cancelOpp = buildCancellationRateOpportunity({
      brandId: brand.id,
      brandName: brand.name,
      cancellationRate: cancellationRate(currentOrders) ?? 0,
      cancelledCount: cancelledOrdersCount(currentOrders),
      totalOrders: totalOrders(currentOrders),
      topReason,
    });
    if (cancelOpp) drafts.push(cancelOpp);

    // Produtos: sem venda (todo o histórico, mesma classificação de /produtos).
    const { data: products } = await supabase.from("products").select("*").eq("brand_id", brand.id);
    const { data: allTimeOrdersRaw } = await supabase
      .from("orders")
      .select("status, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
      .in("store_id", storeFallback)
      .limit(20000);
    interface OrderWithItems {
      status: string;
      ordered_at: string;
      order_items: { original_name: string; quantity: number; total_price: number; is_addon: boolean }[];
    }
    const flatten = (rows: OrderWithItems[]) =>
      rows.flatMap((o) =>
        o.order_items.map((i) => ({ ...i, order_status: o.status, ordered_at: o.ordered_at, original_name: i.original_name }))
      );
    const allTimeItems = flatten((allTimeOrdersRaw ?? []) as unknown as OrderWithItems[]);
    const allTimeRanking = buildProductRanking(allTimeItems, "principal");
    const allTimeAllRanking = buildProductRanking(allTimeItems, "all");
    const principalNames = new Set(allTimeRanking.map((r) => r.name));
    const addonOnlyNames = new Set(allTimeAllRanking.map((r) => r.name).filter((n) => !principalNames.has(n)));
    const allTimeSalesByName = new Map<string, AllTimeSalesInfo>(
      allTimeRanking.map((r) => [r.name, { name: r.name, lastSoldAt: r.lastSoldAt, totalQuantity: r.quantity }])
    );
    const duplicateProductGroups = findDuplicateProducts((products ?? []).map((p) => ({ id: p.id, brand_id: p.brand_id, canonical_name: p.canonical_name })));
    const duplicateNames = new Set(duplicateProductGroups.map((g) => g.name));

    const periodQuantityByName = new Map<string, number>();
    for (const item of allTimeItems) {
      if (item.order_status !== "concluido" || item.is_addon) continue;
      if (item.ordered_at < period.start.toISOString() || item.ordered_at > period.end.toISOString()) continue;
      periodQuantityByName.set(item.original_name, (periodQuantityByName.get(item.original_name) ?? 0) + item.quantity);
    }

    const classification = classifyLowPerformers({
      products: (products ?? []).map((p) => ({ id: p.id, canonical_name: p.canonical_name, is_active: p.is_active, created_at: p.created_at })),
      periodQuantityByName,
      allTimeSalesByName,
      addonOnlyNames,
      duplicateNames,
      now,
      minSampleDays: MIN_SAMPLE_DAYS,
      lowQuantityThreshold: LOW_QUANTITY_THRESHOLD,
      staleDaysThreshold: STALE_DAYS_THRESHOLD,
    });
    const staleCount = classification.rows.filter((r) => r.reason === "sem_venda_recente").length;
    const neverSoldCount = classification.rows.filter((r) => r.reason === "nunca_vendeu").length;
    const pricedProducts = (products ?? []).filter((p) => p.current_price !== null);
    const avgCatalogPrice = pricedProducts.length
      ? pricedProducts.reduce((sum, p) => sum + (p.current_price ?? 0), 0) / pricedProducts.length
      : null;

    const staleOpp = buildStaleProductsOpportunity({
      brandId: brand.id,
      brandName: brand.name,
      staleCount,
      neverSoldCount,
      totalCatalogCount: (products ?? []).length,
      avgCatalogPrice,
      staleDaysThreshold: STALE_DAYS_THRESHOLD,
    });
    if (staleOpp) drafts.push(staleOpp);

    // Qualidade de dados: categorias e produtos duplicados.
    const { data: categories } = await supabase.from("categories").select("*").eq("brand_id", brand.id);
    const exactCategoryGroups = findExactDuplicateGroups((categories ?? []).map((c) => ({ id: c.id, brandId: c.brand_id, canonicalName: c.canonical_name })));
    const legacyDuplicateCategories = findDuplicateCategories((categories ?? []).map((c) => ({ id: c.id, brand_id: c.brand_id, canonical_name: c.canonical_name })));
    const totalDuplicateCategoryCount = new Set([
      ...exactCategoryGroups.flatMap((g) => g.categories.map((c) => c.id)),
      ...legacyDuplicateCategories.flatMap((g) => g.ids),
    ]).size;
    const dupCategoriesOpp = buildDuplicateCategoriesOpportunity({
      brandId: brand.id,
      brandName: brand.name,
      exactGroupCount: exactCategoryGroups.length,
      totalDuplicateCategoryCount,
    });
    if (dupCategoriesOpp) drafts.push(dupCategoriesOpp);

    const dupProductsOpp = buildDuplicateProductsOpportunity({
      brandId: brand.id,
      brandName: brand.name,
      duplicateGroupCount: duplicateProductGroups.length,
      duplicateProductCount: duplicateProductGroups.reduce((sum, g) => sum + g.ids.length, 0),
    });
    if (dupProductsOpp) drafts.push(dupProductsOpp);

    // Clientes: em risco/perdidos (RFM, todo o histórico).
    const { data: customerOrdersRaw } = await supabase
      .from("orders")
      .select("customer_id, gross_amount, ordered_at")
      .in("store_id", storeFallback)
      .not("customer_id", "is", null);
    const customerOrders: CustomerOrderInput[] = (customerOrdersRaw ?? []).map((o) => ({
      customer_id: o.customer_id as string,
      gross_amount: o.gross_amount,
      ordered_at: o.ordered_at,
    }));
    const rfmRows = buildRfmSegmentation(computeCustomerStats(customerOrders, now));
    const atRiskCount = rfmRows.filter((r) => r.segment === "Em risco" || r.segment === "Perdidos").length;
    const customersOpp = buildCustomersAtRiskOpportunity({
      brandId: brand.id,
      brandName: brand.name,
      atRiskCount,
      totalCustomers: rfmRows.length,
      minSample: MIN_CUSTOMER_SAMPLE,
    });
    if (customersOpp) drafts.push(customersOpp);

    // Upsert preservando status/responsável/prazo de oportunidades existentes.
    for (const draft of drafts) {
      const { data: existing } = await supabase
        .from("opportunities")
        .select("id")
        .eq("organization_id", brand.organization_id)
        .eq("brand_id", brand.id)
        .eq("rule_key", draft.ruleKey)
        .maybeSingle();

      const row = {
        organization_id: brand.organization_id,
        brand_id: brand.id,
        rule_key: draft.ruleKey,
        category: draft.category,
        subcategory: draft.subcategory,
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        origin_type: draft.originType,
        origin_explanation: draft.originExplanation,
        evidence: draft.evidence,
        affected_brands: draft.affectedBrands,
        expected_impact: draft.expectedImpact,
        suggested_action: draft.suggestedAction,
        score: draft.score,
        score_explanation: draft.scoreExplanation,
        dashboard_link: draft.dashboardLink,
        updated_at: now,
      };

      if (existing) {
        await supabase.from("opportunities").update(row).eq("id", existing.id);
      } else {
        const { data: inserted } = await supabase.from("opportunities").insert(row).select("id").maybeSingle();
        if (inserted) {
          await supabase.from("opportunity_events").insert({
            opportunity_id: inserted.id,
            event_type: "created",
            actor_user_id: user?.id ?? null,
          });
        }
      }
    }
  }

  revalidatePath("/recomendacoes");
  return { ok: true };
}

const VALID_STATUSES = ["nova", "em_andamento", "concluida", "ignorada", "arquivada"] as const;
export type OpportunityStatus = (typeof VALID_STATUSES)[number];

export async function updateOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<SimpleResult> {
  if (!VALID_STATUSES.includes(status)) return { ok: false, error: "Status inválido." };
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { error } = await supabase.from("opportunities").update({ status, updated_at: new Date().toISOString() }).eq("id", opportunityId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("opportunity_events").insert({
    opportunity_id: opportunityId,
    event_type: "status_changed",
    actor_user_id: user?.id ?? null,
    metadata: { status },
  });

  const { data: opp } = await supabase.from("opportunities").select("organization_id").eq("id", opportunityId).maybeSingle();
  if (opp) {
    await logAudit(supabase, {
      organizationId: opp.organization_id,
      actorUserId: user?.id ?? null,
      action: "update_opportunity_status",
      entityType: "opportunity",
      entityId: opportunityId,
      metadata: { status },
    });
  }

  revalidatePath("/recomendacoes");
  return { ok: true };
}

export async function addOpportunityNote(opportunityId: string, note: string): Promise<SimpleResult> {
  const trimmed = note.trim();
  if (trimmed.length === 0) return { ok: false, error: "Escreva uma observação." };
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { error } = await supabase.from("opportunity_notes").insert({
    opportunity_id: opportunityId,
    author_user_id: user?.id ?? null,
    note: trimmed,
  });
  if (error) return { ok: false, error: error.message };

  await supabase.from("opportunity_events").insert({
    opportunity_id: opportunityId,
    event_type: "note_added",
    actor_user_id: user?.id ?? null,
  });

  revalidatePath("/recomendacoes");
  return { ok: true };
}

export async function assignOpportunity(opportunityId: string, userId: string | null): Promise<SimpleResult> {
  const supabase = await createClient();
  const actor = await getCurrentUser();

  const { error } = await supabase.from("opportunities").update({ assignee_user_id: userId, updated_at: new Date().toISOString() }).eq("id", opportunityId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("opportunity_events").insert({
    opportunity_id: opportunityId,
    event_type: "assigned",
    actor_user_id: actor?.id ?? null,
    metadata: { assignee_user_id: userId },
  });

  revalidatePath("/recomendacoes");
  return { ok: true };
}

export async function setOpportunityDueDate(opportunityId: string, dueDate: string | null): Promise<SimpleResult> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { error } = await supabase.from("opportunities").update({ due_date: dueDate, updated_at: new Date().toISOString() }).eq("id", opportunityId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("opportunity_events").insert({
    opportunity_id: opportunityId,
    event_type: "due_date_set",
    actor_user_id: user?.id ?? null,
    metadata: { due_date: dueDate },
  });

  revalidatePath("/recomendacoes");
  return { ok: true };
}

export interface OpportunityHistoryEntry {
  id: string;
  eventType: string;
  actorUserId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
export interface OpportunityNoteEntry {
  id: string;
  authorUserId: string | null;
  note: string;
  createdAt: string;
}

export async function getOpportunityHistory(opportunityId: string): Promise<{ events: OpportunityHistoryEntry[]; notes: OpportunityNoteEntry[] }> {
  const supabase = await createClient();
  const [{ data: events }, { data: notes }] = await Promise.all([
    supabase.from("opportunity_events").select("id, event_type, actor_user_id, metadata, created_at").eq("opportunity_id", opportunityId).order("created_at", { ascending: false }),
    supabase.from("opportunity_notes").select("id, author_user_id, note, created_at").eq("opportunity_id", opportunityId).order("created_at", { ascending: false }),
  ]);

  return {
    events: (events ?? []).map((e) => ({ id: e.id, eventType: e.event_type, actorUserId: e.actor_user_id, metadata: e.metadata, createdAt: e.created_at })),
    notes: (notes ?? []).map((n) => ({ id: n.id, authorUserId: n.author_user_id, note: n.note, createdAt: n.created_at })),
  };
}
