import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasWriteAccess } from "@/lib/auth/session";
import { GlobalFilterBar } from "@/components/filters/global-filter-bar";
import { ClientesExtraFilters } from "@/components/clientes/clientes-extra-filters";
import { SegmentDistribution } from "@/components/clientes/segment-distribution";
import { CustomerTable, type CustomerRow } from "@/components/clientes/customer-table";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { buildRfmSegmentation, computeCustomerStats, type CustomerOrderInput, type RfmSegment } from "@/lib/metrics/rfm";
import { Repeat, UserMinus, UserPlus, Users, Zap } from "lucide-react";
import type { Brand, Store } from "@/types/database";

const MIN_SAMPLE_SIZE = 10;
const INACTIVE_RECENCY_SCORE_THRESHOLD = 2;

const SEGMENT_ORDER: RfmSegment[] = [
  "Clientes de alto valor",
  "Clientes fiéis",
  "Em crescimento",
  "Novos",
  "Em risco",
  "Inativos",
  "Perdidos",
];

function formatNumber(value: number | null, digits = 1) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default async function CustomersRfmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selectedBrandId = typeof params.brand === "string" ? params.brand : null;
  const storesRaw = typeof params.stores === "string" ? params.stores : "";
  const selectedStoreIdsParam = storesRaw ? storesRaw.split(",").filter(Boolean) : [];
  const search = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const segmentFilter = typeof params.segment === "string" ? (params.segment as RfmSegment) : null;
  const minRecency = typeof params.minRecency === "string" ? Number(params.minRecency) : null;
  const maxRecency = typeof params.maxRecency === "string" ? Number(params.maxRecency) : null;
  const minFrequency = typeof params.minFrequency === "string" ? Number(params.minFrequency) : null;
  const maxFrequency = typeof params.maxFrequency === "string" ? Number(params.maxFrequency) : null;
  const minValue = typeof params.minValue === "string" ? Number(params.minValue) : null;
  const maxValue = typeof params.maxValue === "string" ? Number(params.maxValue) : null;

  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const isAdmin = (user?.memberships ?? []).some((m) => m.role === "admin_geral");
  const canExport = (user?.memberships ?? []).some((m) => hasWriteAccess(m.role));

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .returns<Brand[]>();

  const allBrandIds = (brands ?? []).map((b) => b.id);
  const brandIds = selectedBrandId && allBrandIds.includes(selectedBrandId) ? [selectedBrandId] : allBrandIds;

  const { data: stores } = await supabase
    .from("stores")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Store[]>();

  const allStoreIds = (stores ?? []).map((s) => s.id);
  const selectedStoreIds = selectedStoreIdsParam.filter((id) => allStoreIds.includes(id));
  const scopedStoreIds = selectedStoreIds.length > 0 ? selectedStoreIds : allStoreIds;
  const storeFallback = scopedStoreIds.length ? scopedStoreIds : fallback;

  // RFM usa todo o histórico sincronizado, não um período — ver METRICS.md.
  const { data: ordersRaw } = await supabase
    .from("orders")
    .select("customer_id, gross_amount, ordered_at")
    .in("store_id", storeFallback)
    .not("customer_id", "is", null);

  const customerOrders: CustomerOrderInput[] = (ordersRaw ?? []).map((o) => ({
    customer_id: o.customer_id as string,
    gross_amount: o.gross_amount,
    ordered_at: o.ordered_at,
  }));

  const now = new Date().toISOString();
  const stats = computeCustomerStats(customerOrders, now);
  const rfmRows = buildRfmSegmentation(stats);

  const customerIds = rfmRows.map((r) => r.customerId);
  const { data: customersRaw } = customerIds.length
    ? await supabase.from("customers").select("id, full_name, phone_masked").in("id", customerIds)
    : { data: [] };

  const customerById = new Map((customersRaw ?? []).map((c) => [c.id, c]));

  const segmentCounts = new Map<RfmSegment, number>();
  for (const row of rfmRows) {
    segmentCounts.set(row.segment, (segmentCounts.get(row.segment) ?? 0) + 1);
  }

  const lowSample = rfmRows.length > 0 && rfmRows.length < MIN_SAMPLE_SIZE;

  // KPIs (base: todos os clientes identificados no escopo, todo o histórico).
  const uniqueCount = rfmRows.length;
  const newCount = segmentCounts.get("Novos") ?? 0;
  const recurringCount = rfmRows.filter((r) => r.frequency > 1).length;
  const inactiveCount = rfmRows.filter((r) => r.recencyScore <= INACTIVE_RECENCY_SCORE_THRESHOLD).length;
  const avgFrequency = uniqueCount > 0 ? rfmRows.reduce((sum, r) => sum + r.frequency, 0) / uniqueCount : null;

  const totalForDistribution = rfmRows.length;
  const distributionRows = SEGMENT_ORDER.filter((s) => (segmentCounts.get(s) ?? 0) > 0).map((segment) => ({
    key: segment,
    label: segment,
    count: segmentCounts.get(segment) ?? 0,
    share: totalForDistribution > 0 ? (segmentCounts.get(segment) ?? 0) / totalForDistribution : 0,
  }));

  // Filtros contextuais (busca, segmento, recência/frequência/valor).
  const filteredRows: CustomerRow[] = rfmRows
    .map((row) => {
      const customer = customerById.get(row.customerId);
      return {
        id: row.customerId,
        fullName: customer?.full_name ?? null,
        phoneMasked: customer?.phone_masked ?? null,
        isAnonymized: !customer?.full_name && !customer?.phone_masked,
        recencyDays: row.recencyDays,
        frequency: row.frequency,
        monetary: row.monetary,
        segment: row.segment,
      };
    })
    .filter((row) => {
      if (segmentFilter && row.segment !== segmentFilter) return false;
      if (minRecency !== null && !Number.isNaN(minRecency) && row.recencyDays < minRecency) return false;
      if (maxRecency !== null && !Number.isNaN(maxRecency) && row.recencyDays > maxRecency) return false;
      if (minFrequency !== null && !Number.isNaN(minFrequency) && row.frequency < minFrequency) return false;
      if (maxFrequency !== null && !Number.isNaN(maxFrequency) && row.frequency > maxFrequency) return false;
      if (minValue !== null && !Number.isNaN(minValue) && row.monetary < minValue) return false;
      if (maxValue !== null && !Number.isNaN(maxValue) && row.monetary > maxValue) return false;
      if (search) {
        const name = (row.fullName ?? "").toLowerCase();
        const phone = (row.phoneMasked ?? "").toLowerCase();
        if (!name.includes(search) && !phone.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => b.monetary - a.monetary);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Segmentação estimada por percentil de Recência, Frequência e Valor monetário —
            considera todo o histórico de pedidos identificados, não só um período.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <GlobalFilterBar
          fields={["brand", "stores"]}
          brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))}
          stores={(stores ?? []).map((s) => ({ id: s.id, name: s.name }))}
          currentBrandId={selectedBrandId}
          currentStoreIds={selectedStoreIds}
        />
        <ClientesExtraFilters
          currentSearch={typeof params.q === "string" ? params.q : undefined}
          currentSegment={segmentFilter}
          currentMinRecency={typeof params.minRecency === "string" ? params.minRecency : undefined}
          currentMaxRecency={typeof params.maxRecency === "string" ? params.maxRecency : undefined}
          currentMinFrequency={typeof params.minFrequency === "string" ? params.minFrequency : undefined}
          currentMaxFrequency={typeof params.maxFrequency === "string" ? params.maxFrequency : undefined}
          currentMinValue={typeof params.minValue === "string" ? params.minValue : undefined}
          currentMaxValue={typeof params.maxValue === "string" ? params.maxValue : undefined}
        />
      </div>

      {lowSample && (
        <Card className="border-warning">
          <CardContent className="pt-6 text-sm text-warning">
            Apenas {rfmRows.length} cliente(s) identificado(s) — abaixo do mínimo recomendado (
            {MIN_SAMPLE_SIZE}) para os percentis de RFM serem representativos. Trate a segmentação
            abaixo como baixa confiança.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Clientes únicos"
          definition="Clientes distintos com pelo menos um pedido identificado, em todo o histórico sincronizado (não só o escopo de período — RFM não usa período)."
          basis="Todo o histórico, cliente identificado"
          value={String(uniqueCount)}
          icon={<Users className="size-4" />}
          state="neutral"
        />
        <KpiCard
          label="Novos"
          definition="Segmento RFM 'Novos': primeira e única compra recente (frequência = 1 e recência entre as melhores do grupo)."
          basis="Segmento RFM 'Novos'"
          value={String(newCount)}
          icon={<UserPlus className="size-4" />}
          state="neutral"
        />
        <KpiCard
          label="Recorrentes"
          definition="Clientes com mais de um pedido identificado em todo o histórico."
          basis="Frequência > 1"
          value={String(recurringCount)}
          icon={<Repeat className="size-4" />}
          state="neutral"
        />
        <KpiCard
          label="Inativos"
          definition="Clientes no percentil mais baixo de recência (score RFM ≤ 2 de 5) — não compram há relativamente mais tempo que o restante da base."
          basis="Score de recência ≤ 2/5"
          value={String(inactiveCount)}
          icon={<UserMinus className="size-4" />}
          state={inactiveCount > 0 ? "critical" : "positive"}
        />
        <KpiCard
          label="Frequência média"
          definition="Média de pedidos identificados por cliente, em todo o histórico."
          basis="Total de pedidos / clientes únicos"
          value={formatNumber(avgFrequency)}
          icon={<Zap className="size-4" />}
          state="neutral"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segmentos RFM</CardTitle>
            <CardDescription>{rfmRows.length} cliente(s) identificado(s) no escopo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {SEGMENT_ORDER.filter((s) => (segmentCounts.get(s) ?? 0) > 0).map((segment) => (
              <div key={segment} className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">{segment}</p>
                <p className="text-lg font-semibold">{segmentCounts.get(segment)}</p>
              </div>
            ))}
            {rfmRows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente identificado ainda (pedidos sem cliente vinculado não entram na base de RFM).
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por segmento</CardTitle>
            <CardDescription>Participação de cada segmento na base de clientes identificados.</CardDescription>
          </CardHeader>
          <CardContent>
            <SegmentDistribution rows={distributionRows} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes</CardTitle>
          <CardDescription>{filteredRows.length} cliente(s) nos filtros selecionados, ordenado por valor total.</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomerTable rows={filteredRows} canAnonymize={isAdmin} canExport={canExport} />
        </CardContent>
      </Card>
    </div>
  );
}
