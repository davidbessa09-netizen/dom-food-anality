// Classificação de "estado da sincronização" pra exibir na interface —
// mesma regra em qualquer tela que mostre "última sincronização" (Produtos
// vendidos, Integrações, dashboard). Ver METRICS_AUDIT.md.

export type SyncFreshness = "atualizado" | "atrasado" | "falha" | "nunca_sincronizou";

const DELAYED_THRESHOLD_MINUTES = 10;
const FAILED_THRESHOLD_MINUTES = 15;

export const SYNC_FRESHNESS_LABELS: Record<SyncFreshness, string> = {
  atualizado: "Dados atualizados",
  atrasado: "Sincronização atrasada",
  falha: "Falha na atualização automática",
  nunca_sincronizou: "Nunca sincronizado",
};

/**
 * `lastSyncedAtIso` deve ser o horário do último SUCESSO (não da última
 * tentativa) — um job que só tentou e falhou não deve fazer a tela parecer
 * "atualizada". > 10min = atrasada, > 15min = falha; nunca sincronizou tem
 * rótulo próprio (não é "falha", pode ser a primeira execução).
 */
export function classifySyncFreshness(lastSyncedAtIso: string | null, nowIso: string = new Date().toISOString()): SyncFreshness {
  if (!lastSyncedAtIso) return "nunca_sincronizou";
  const minutesSince = (new Date(nowIso).getTime() - new Date(lastSyncedAtIso).getTime()) / 60_000;
  if (minutesSince > FAILED_THRESHOLD_MINUTES) return "falha";
  if (minutesSince > DELAYED_THRESHOLD_MINUTES) return "atrasado";
  return "atualizado";
}
