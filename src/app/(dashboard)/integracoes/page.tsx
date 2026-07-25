import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CredentialForm } from "./credential-form";
import { SyncButton } from "./sync-button";
import { SyncLogViewer } from "./sync-log-viewer";
import { formatDateTimeBR } from "@/lib/dates/format";
import type { Brand, Store } from "@/types/database";

interface SalesChannelRow {
  id: string;
  store_id: string;
  platform: string;
}

interface IntegrationRow {
  id: string;
  sales_channel_id: string;
  platform: string;
  last_synced_at: string | null;
  last_cursor: string | null;
}

interface SyncJobRow {
  id: string;
  integration_id: string;
  status: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  records_fetched: number;
  records_upserted: number;
  records_failed: number;
  error_summary: string | null;
}

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

export default async function IntegrationsPage() {
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
    .eq("platform", "anota_ai")
    .in("store_id", storeFallback)
    .returns<SalesChannelRow[]>();

  const channelIds = (channels ?? []).map((c) => c.id);

  const { data: integrations } = await supabase
    .from("integrations")
    .select("id, sales_channel_id, platform, last_synced_at, last_cursor")
    .in("sales_channel_id", channelIds.length ? channelIds : fallback)
    .returns<IntegrationRow[]>();

  const integrationIds = (integrations ?? []).map((i) => i.id);

  const { data: syncJobs } = await supabase
    .from("sync_jobs")
    .select("id, integration_id, status, trigger, started_at, finished_at, records_fetched, records_upserted, records_failed, error_summary")
    .in("integration_id", integrationIds.length ? integrationIds : fallback)
    .order("started_at", { ascending: false })
    .limit(20)
    .returns<SyncJobRow[]>();

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));
  const integrationBySalesChannel = new Map((integrations ?? []).map((i) => [i.sales_channel_id, i]));

  // Sempre lista todos os canais Anota AI — inclusive os que já têm token,
  // para permitir recadastrar/atualizar (ex.: token expirado ou revogado).
  const channelOptions = (channels ?? []).map((c) => {
    const store = storeById.get(c.store_id);
    const brand = store ? brandById.get(store.brand_id) : undefined;
    const already = integrationBySalesChannel.get(c.id);
    return {
      salesChannelId: c.id,
      label: `${brand?.name ?? "—"} — ${store?.name ?? "—"} (Anota AI)${already ? " · já cadastrada" : ""}`,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground">
          Anota AI via polling (<code>ping/list</code> + <code>ping/get</code>) — ver
          INTEGRATIONS.md para o histórico completo da verificação da API. iFood
          segue bloqueado até confirmação de acesso de parceiro.
        </p>
      </div>

      {channelOptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastrar token da Anota AI</CardTitle>
            <CardDescription>
              Pegue o token no Portal de Integração (integracao.anota.ai), dentro do
              estabelecimento cadastrado. Fica armazenado criptografado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CredentialForm channels={channelOptions} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrações ativas</CardTitle>
          <CardDescription>{(integrations ?? []).length} integração(ões) configurada(s).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(integrations ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma integração cadastrada ainda.</p>
          )}
          {(integrations ?? []).map((integration) => {
            const channel = (channels ?? []).find((c) => c.id === integration.sales_channel_id);
            const store = channel ? storeById.get(channel.store_id) : undefined;
            const brand = store ? brandById.get(store.brand_id) : undefined;
            return (
              <div key={integration.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="font-medium">
                    {brand?.name ?? "—"} — {store?.name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {integration.last_synced_at
                      ? `Última sincronização: ${formatDateTimeBR(integration.last_synced_at)}`
                      : "Nunca sincronizado"}
                  </p>
                </div>
                <SyncButton integrationId={integration.id} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de sincronizações</CardTitle>
          <CardDescription>Últimas 20 execuções.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Início</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
                <TableHead className="text-right">Logs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(syncJobs ?? []).map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-xs">{formatDateTimeBR(job.started_at)}</TableCell>
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
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
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
