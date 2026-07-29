// Janela de busca incremental da sincronização — nunca refaz todo o
// histórico a cada execução, mas também nunca usa exatamente o horário do
// último sucesso como corte (perderia pedidos atrasados/alterados que
// chegaram poucos minutos antes). Ver METRICS_AUDIT.md / migration 0015.

const DEFAULT_OVERLAP_MINUTES = 10;
const RECONCILIATION_LOOKBACK_DAYS = 7;

/**
 * Calcula o `since` a enviar pro adapter da plataforma de origem: alguns
 * minutos ANTES do último sucesso, nunca em cima dele — a sobreposição
 * evita perder pedido atrasado/alterado. `null` (nunca sincronizou) sempre
 * busca tudo (retorna undefined).
 */
export function computeSyncSince(
  lastSyncedAtIso: string | null,
  overlapMinutes: number = DEFAULT_OVERLAP_MINUTES
): string | undefined {
  if (!lastSyncedAtIso) return undefined;
  const lastSynced = new Date(lastSyncedAtIso).getTime();
  return new Date(lastSynced - overlapMinutes * 60_000).toISOString();
}

/** Reconciliação noturna ignora o cursor normal e sempre revê os últimos N
 * dias — corrige cancelamento/estorno/divergência sem depender de ter
 * rodado certinho todo santo ciclo de 5 minutos. */
export function computeReconciliationSince(nowIso: string = new Date().toISOString(), lookbackDays: number = RECONCILIATION_LOOKBACK_DAYS): string {
  const now = new Date(nowIso).getTime();
  return new Date(now - lookbackDays * 24 * 60 * 60_000).toISOString();
}
