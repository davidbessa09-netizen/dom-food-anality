import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { subDays } from "date-fns";
import {
  buildSyncAlerts,
  type IntegrationHealthInput,
  type RecentSyncJobInput,
  type AlertSeverity,
} from "@/lib/metrics/alerts";
import type { Brand, Store } from "@/types/database";

const STALE_THRESHOLD_MINUTES = 60; // cron roda a cada ~10min — tolera algumas falhas antes de alertar
const RECENT_JOBS_WINDOW_DAYS = 1;

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  alta: "Alta prioridade",
  media: "Média prioridade",
};

const SEVERITY_VARIANT: Record<AlertSeverity, "destructive" | "default"> = {
  alta: "destructive",
  media: "default",
};

interface SalesChannelRow {
  id: string;
  store_id: string;
  platform: string;
}

interface IntegrationRow {
  id: string;
  sales_channel_id: string;
  last_synced_at: string | null;
  is_active: boolean;
}

interface SyncJobRow {
  integration_id: string;
  status: string;
  error_summary: string | null;
  records_failed: number;
  started_at: string;
}

export default async function AlertsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .returns<Brand[]>();

  const brandIds = (brands ?? []).map((b) => b.id);

  const { data: stores } = await supabase
    .from("stores")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Store[]>();

  const storeIds = (stores ?? []).map((s) => s.id);
  const storeFallback = storeIds.length ? storeIds : fallback;

  const { data: channels } = await supabase
    .from("sales_channels")
    .select("id, store_id, platform")
    .in("store_id", storeFallback)
    .returns<SalesChannelRow[]>();

  const channelIds = (channels ?? []).map((c) => c.id);

  const { data: integrations } = await supabase
    .from("integrations")
    .select("id, sales_channel_id, last_synced_at, is_active")
    .in("sales_channel_id", channelIds.length ? channelIds : fallback)
    .returns<IntegrationRow[]>();

  const integrationIds = (integrations ?? []).map((i) => i.id);
  const since = subDays(new Date(), RECENT_JOBS_WINDOW_DAYS).toISOString();

  const { data: recentJobsRaw } = await supabase
    .from("sync_jobs")
    .select("integration_id, status, error_summary, records_failed, started_at")
    .in("integration_id", integrationIds.length ? integrationIds : fallback)
    .gte("started_at", since)
    .returns<SyncJobRow[]>();

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));
  const channelById = new Map((channels ?? []).map((c) => [c.id, c]));

  function labelFor(salesChannelId: string): string {
    const channel = channelById.get(salesChannelId);
    const store = channel ? storeById.get(channel.store_id) : undefined;
    const brand = store ? brandById.get(store.brand_id) : undefined;
    return `${brand?.name ?? "—"} — ${store?.name ?? "—"}`;
  }

  const integrationInputs: IntegrationHealthInput[] = (integrations ?? []).map((i) => ({
    integrationId: i.id,
    label: labelFor(i.sales_channel_id),
    lastSyncedAt: i.last_synced_at,
    isActive: i.is_active,
  }));

  const recentJobInputs: RecentSyncJobInput[] = (recentJobsRaw ?? []).map((j) => ({
    integrationId: j.integration_id,
    status: j.status,
    errorSummary: j.error_summary,
    recordsFailed: j.records_failed,
    startedAt: j.started_at,
  }));

  const alerts = buildSyncAlerts({
    integrations: integrationInputs,
    recentJobs: recentJobInputs,
    now: new Date().toISOString(),
    staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted-foreground">
          Estado real das sincronizações (falhas, sincronização parcial ou loja
          sem sincronizar há mais de {STALE_THRESHOLD_MINUTES} minutos). Não
          cobre alertas de negócio (vendas, cancelamento) — esses ficam em{" "}
          <span className="font-medium">Recomendações</span>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas ativos</CardTitle>
          <CardDescription>{alerts.length} alerta(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-md border p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant={SEVERITY_VARIANT[alert.severity]}>{SEVERITY_LABEL[alert.severity]}</Badge>
                <span className="font-medium">{alert.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{alert.description}</p>
            </div>
          ))}
          {alerts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum alerta no momento — todas as integrações ativas sincronizaram
              recentemente sem falhas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
