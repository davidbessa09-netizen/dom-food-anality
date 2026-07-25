import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { SyncLogViewer } from "../integracoes/sync-log-viewer";
import { formatDateTimeBR } from "@/lib/dates/format";
import type { Brand, Store } from "@/types/database";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  running: "Rodando",
  success: "Sucesso",
  partial_success: "Sucesso parcial",
  failed: "Falhou",
};

function statusVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  if (status === "success") return "default";
  if (status === "failed") return "destructive";
  if (status === "partial_success") return "secondary";
  return "outline";
}

interface SalesChannelRow {
  id: string;
  store_id: string;
}

interface IntegrationRow {
  id: string;
  sales_channel_id: string;
}

interface SyncJobRow {
  id: string;
  integration_id: string;
  status: string;
  trigger: string;
  started_at: string;
  records_fetched: number;
  records_upserted: number;
  records_failed: number;
  error_summary: string | null;
}

export default async function SyncHistoryPage() {
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

  const { data: channels } = await supabase
    .from("sales_channels")
    .select("id, store_id")
    .in("store_id", storeIds.length ? storeIds : fallback)
    .returns<SalesChannelRow[]>();

  const channelIds = (channels ?? []).map((c) => c.id);

  const { data: integrations } = await supabase
    .from("integrations")
    .select("id, sales_channel_id")
    .in("sales_channel_id", channelIds.length ? channelIds : fallback)
    .returns<IntegrationRow[]>();

  const integrationIds = (integrations ?? []).map((i) => i.id);

  const { data: syncJobs } = await supabase
    .from("sync_jobs")
    .select("id, integration_id, status, trigger, started_at, records_fetched, records_upserted, records_failed, error_summary")
    .in("integration_id", integrationIds.length ? integrationIds : fallback)
    .order("started_at", { ascending: false })
    .limit(100)
    .returns<SyncJobRow[]>();

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));
  const channelById = new Map((channels ?? []).map((c) => [c.id, c]));
  const integrationById = new Map((integrations ?? []).map((i) => [i.id, i]));

  function labelFor(integrationId: string): string {
    const integration = integrationById.get(integrationId);
    const channel = integration ? channelById.get(integration.sales_channel_id) : undefined;
    const store = channel ? storeById.get(channel.store_id) : undefined;
    const brand = store ? brandById.get(store.brand_id) : undefined;
    return `${brand?.name ?? "—"} — ${store?.name ?? "—"}`;
  }

  const failedCount = (syncJobs ?? []).filter((j) => j.status === "failed").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico de sincronizações</h1>
        <p className="text-sm text-muted-foreground">
          Últimas {(syncJobs ?? []).length} execuções de todas as integrações,
          consolidadas em uma única lista (antes só dava pra ver uma integração
          por vez dentro de Integrações).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execuções</CardTitle>
          <CardDescription>
            {(syncJobs ?? []).length} execução(ões){failedCount > 0 ? `, ${failedCount} com falha` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Gatilho</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
                <TableHead className="text-right">Logs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(syncJobs ?? []).map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="whitespace-nowrap text-sm">{labelFor(job.integration_id)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTimeBR(job.started_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{job.trigger}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(job.status)}>{STATUS_LABELS[job.status] ?? job.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {job.records_upserted}/{job.records_fetched} processado(s)
                    {job.records_failed > 0 ? `, ${job.records_failed} com erro` : ""}
                    {job.error_summary ? ` — ${job.error_summary}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <SyncLogViewer syncJobId={job.id} />
                  </TableCell>
                </TableRow>
              ))}
              {(syncJobs ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Nenhuma sincronização executada ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
