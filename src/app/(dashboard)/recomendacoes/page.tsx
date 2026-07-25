import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { OpportunitiesFilters } from "@/components/recomendacoes/opportunities-filters";
import { OpportunityCard } from "@/components/recomendacoes/opportunity-card";
import { RefreshOpportunitiesButton } from "@/components/recomendacoes/refresh-opportunities-button";
import { CATEGORY_LABELS, type OpportunityRow } from "@/components/recomendacoes/opportunity-types";
import { refreshOpportunities, type OpportunityStatus } from "./actions";
import type { OpportunityCategory, OpportunityOrigin, OpportunityPriority } from "@/lib/intelligence/opportunity-rules";
import type { Brand } from "@/types/database";

const PRIORITY_RANK: Record<OpportunityPriority, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

interface OpportunityDbRow {
  id: string;
  brand_id: string | null;
  category: OpportunityCategory;
  subcategory: string;
  title: string;
  description: string;
  priority: OpportunityPriority;
  origin_type: OpportunityOrigin;
  origin_explanation: string;
  evidence: { label: string; value: string }[];
  affected_brands: string[];
  expected_impact: string[];
  suggested_action: string;
  score: number;
  score_explanation: string;
  dashboard_link: string | null;
  status: OpportunityStatus;
  assignee_user_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const categoryFilter = typeof params.category === "string" ? (params.category as OpportunityCategory) : null;
  const brandFilter = typeof params.brand === "string" ? params.brand : null;
  const statusFilter = typeof params.status === "string" ? (params.status as OpportunityStatus) : null;
  const originFilter = typeof params.origin === "string" ? (params.origin as OpportunityOrigin) : null;
  const sort = typeof params.sort === "string" ? params.sort : "score";

  const user = await getCurrentUser();
  const supabase = await createClient();
  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .returns<Brand[]>();
  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));

  const { data: existingOpportunities } = await supabase
    .from("opportunities")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .returns<OpportunityDbRow[]>();

  // Primeira visita (nunca rodou o motor de regras nesta organização) — gera
  // uma vez automaticamente pra tela não abrir vazia. Depois disso,
  // atualizações são explícitas via o botão "Atualizar".
  let opportunitiesRaw = existingOpportunities ?? [];
  if (opportunitiesRaw.length === 0) {
    await refreshOpportunities();
    const { data: refreshed } = await supabase
      .from("opportunities")
      .select("*")
      .in("organization_id", orgIds.length ? orgIds : fallback)
      .returns<OpportunityDbRow[]>();
    opportunitiesRaw = refreshed ?? [];
  }

  const rows: OpportunityRow[] = opportunitiesRaw.map((o) => ({
    id: o.id,
    brandId: o.brand_id,
    brandName: o.brand_id ? brandById.get(o.brand_id)?.name ?? "—" : "—",
    category: o.category,
    subcategory: o.subcategory,
    title: o.title,
    description: o.description,
    priority: o.priority,
    originType: o.origin_type,
    originExplanation: o.origin_explanation,
    evidence: o.evidence,
    affectedBrands: o.affected_brands,
    expectedImpact: o.expected_impact,
    suggestedAction: o.suggested_action,
    score: o.score,
    scoreExplanation: o.score_explanation,
    dashboardLink: o.dashboard_link,
    status: o.status,
    assigneeUserId: o.assignee_user_id,
    dueDate: o.due_date,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }));

  const filtered = rows.filter((r) => {
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (brandFilter && r.brandId !== brandFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (originFilter && r.originType !== originFilter) return false;
    if (search) {
      const haystack = `${r.title} ${r.description} ${r.subcategory}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "priority") return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
    return b.score - a.score;
  });

  const categoryCounts = new Map<OpportunityCategory, number>();
  for (const r of rows) categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);

  const currentUserId = user?.id ?? "";
  const currentUserLabel = user?.email ? `Eu (${user.email})` : "Eu";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel de Inteligência e Oportunidades</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Cada oportunidade cita a origem (regra determinística ou modelo estatístico — nunca
            &quot;IA&quot;, já que nenhum modelo generativo roda aqui), a evidência que a gerou e um score de
            prioridade explicado. &quot;Prazo&quot; fica salvo e visível; lembretes automáticos (notificação
            em uma data) ainda não existem neste sistema — não fabricamos esse envio.
          </p>
        </div>
        <RefreshOpportunitiesButton />
      </div>

      <OpportunitiesFilters
        currentSearch={typeof params.q === "string" ? params.q : undefined}
        currentCategory={categoryFilter}
        currentBrandId={brandFilter}
        currentStatus={statusFilter}
        currentOrigin={originFilter}
        currentSort={sort}
        brands={(brands ?? []).map((b) => ({ value: b.id, label: b.name }))}
      />

      <div className="flex flex-wrap gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <div key={key} className="rounded-md border px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">{label}:</span>{" "}
            <span className="font-medium">{categoryCounts.get(key as OpportunityCategory) ?? 0}</span>
          </div>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="pt-4 text-xs text-muted-foreground">
          Categoria &quot;Marketing&quot; (campanhas, ROI, CAC) e indicadores de estoque não aparecem
          aqui: o sistema ainda não coleta dado de gasto com campanha, conversão de canal pago nem
          estoque/inventário. Assim que essas integrações existirem, as regras correspondentes
          podem ser adicionadas — até lá, nenhum número desses é estimado ou inventado.
        </CardContent>
      </Card>

      <div className="space-y-3">
        {sorted.map((row) => (
          <OpportunityCard key={row.id} row={row} currentUserId={currentUserId} currentUserLabel={currentUserLabel} />
        ))}
        {sorted.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nenhuma oportunidade encontrada</CardTitle>
              <CardDescription>
                {rows.length === 0
                  ? "Clique em Atualizar para rodar as regras pela primeira vez, ou ajuste os filtros de marca/categoria acima."
                  : "Ajuste os filtros para ver as oportunidades já geradas."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
