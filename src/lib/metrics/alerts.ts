// Alertas operacionais de sincronização (Fase 4) — olha só para o estado real
// de `integrations`/`sync_jobs` (ver DATABASE.md). Não infere causa: quando a
// última sincronização falhou, mostramos a mensagem de erro registrada, nunca
// um motivo inventado.

export type AlertSeverity = "alta" | "media";

export interface SyncAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
}

export interface IntegrationHealthInput {
  integrationId: string;
  label: string;
  lastSyncedAt: string | null;
  isActive: boolean;
}

export interface RecentSyncJobInput {
  integrationId: string;
  status: string; // success | partial_success | failed | running | pending
  errorSummary: string | null;
  recordsFailed: number;
  startedAt: string;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.floor(minutes)}min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.floor(minutes % 60);
  return rest > 0 ? `${hours}h${rest}min` : `${hours}h`;
}

export function buildSyncAlerts(params: {
  integrations: IntegrationHealthInput[];
  /** Sync jobs já filtrados pelo chamador para uma janela recente (ex.: últimas 24h). */
  recentJobs: RecentSyncJobInput[];
  now: string;
  staleThresholdMinutes: number;
}): SyncAlert[] {
  const { integrations, recentJobs, now, staleThresholdMinutes } = params;
  const nowMs = new Date(now).getTime();

  const latestJobByIntegration = new Map<string, RecentSyncJobInput>();
  for (const job of recentJobs) {
    const existing = latestJobByIntegration.get(job.integrationId);
    if (!existing || job.startedAt > existing.startedAt) {
      latestJobByIntegration.set(job.integrationId, job);
    }
  }

  const alerts: SyncAlert[] = [];

  for (const integration of integrations) {
    if (!integration.isActive) continue;

    if (integration.lastSyncedAt === null) {
      alerts.push({
        id: `never-synced-${integration.integrationId}`,
        severity: "media",
        title: `${integration.label}: nunca sincronizada`,
        description: "Essa integração ainda não completou nenhuma sincronização.",
      });
    } else {
      const diffMinutes = (nowMs - new Date(integration.lastSyncedAt).getTime()) / 60000;
      if (diffMinutes > staleThresholdMinutes) {
        alerts.push({
          id: `stale-${integration.integrationId}`,
          severity: diffMinutes > staleThresholdMinutes * 2 ? "alta" : "media",
          title: `${integration.label}: sem sincronizar há ${formatDuration(diffMinutes)}`,
          description: `Última sincronização bem-sucedida em ${new Date(integration.lastSyncedAt).toLocaleString("pt-BR")}.`,
        });
      }
    }

    const latestJob = latestJobByIntegration.get(integration.integrationId);
    if (latestJob?.status === "failed") {
      alerts.push({
        id: `failed-${integration.integrationId}`,
        severity: "alta",
        title: `${integration.label}: última sincronização falhou`,
        description: latestJob.errorSummary ?? "Falha registrada sem mensagem de erro detalhada.",
      });
    } else if (latestJob?.status === "partial_success") {
      alerts.push({
        id: `partial-${integration.integrationId}`,
        severity: "media",
        title: `${integration.label}: sincronização parcial`,
        description: `${latestJob.recordsFailed} registro(s) falharam ao gravar na última execução.`,
      });
    }
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "alta" ? -1 : 1));
}
