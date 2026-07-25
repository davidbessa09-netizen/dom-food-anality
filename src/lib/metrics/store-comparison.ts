// Funções puras para a comparação gerencial de lojas (ver METRICS_AUDIT.md).
// A regra central: "sem dado" nunca deve ser tratado como pior desempenho.
// Uma loja pode estar em um de 4 estados, e cada um muda como as métricas
// devem ser lidas/exibidas:
//
// - loja_inativa:        loja desativada de propósito — zero é esperado.
// - integracao_incompleta: nenhum canal ativo terminou uma sincronização —
//   os números dessa loja não são confiáveis (podem estar sub-representados).
// - sem_pedidos_periodo: integração ok, mas zero pedidos reais no período —
//   zero real e confiável.
// - operacional:         tem pelo menos 1 pedido no período, dado confiável.

export type StoreDataStatus =
  | "operacional"
  | "sem_pedidos_periodo"
  | "integracao_incompleta"
  | "loja_inativa";

export interface StoreChannelHealth {
  isActive: boolean;
  lastSyncedAt: string | null;
}

export function classifyStoreDataStatus(params: {
  storeIsActive: boolean;
  channels: StoreChannelHealth[];
  ordersInPeriodCount: number;
}): StoreDataStatus {
  if (!params.storeIsActive) return "loja_inativa";
  const hasReliableChannel = params.channels.some((c) => c.isActive && c.lastSyncedAt !== null);
  if (!hasReliableChannel) return "integracao_incompleta";
  if (params.ordersInPeriodCount === 0) return "sem_pedidos_periodo";
  return "operacional";
}

/** Só lojas com dado confiável (operacional ou zero real) entram em
 * disputas de "melhor X" — integração incompleta e loja inativa nunca
 * competem, pra não premiar/punir por ausência de dado. */
export function isEligibleForRanking(status: StoreDataStatus): boolean {
  return status === "operacional" || status === "sem_pedidos_periodo";
}
