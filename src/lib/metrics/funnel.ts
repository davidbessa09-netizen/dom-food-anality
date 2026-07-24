// Funil de jornada — ver METRICS.md e a "Regra crítica do funil" em
// INTEGRATIONS.md. Sem eventos de navegação do cardápio (menu_events), só
// conseguimos observar o STATUS ATUAL de cada pedido, não a progressão real
// entre etapas (não sabemos, por exemplo, quanto tempo um pedido cancelado
// passou em "confirmado" antes de ser cancelado). Por isso isso é uma
// distribuição de status, não um funil de conversão com taxa de queda
// confiável — nunca apresentar como se fosse.

export type OrderStatus =
  | "criado"
  | "confirmado"
  | "em_preparo"
  | "saiu_para_entrega"
  | "concluido"
  | "cancelado";

export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  "criado",
  "confirmado",
  "em_preparo",
  "saiu_para_entrega",
  "concluido",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  criado: "Pedido criado",
  confirmado: "Confirmado",
  em_preparo: "Em preparo",
  saiu_para_entrega: "Saiu para entrega",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export interface StatusDistributionRow {
  status: OrderStatus;
  count: number;
}

export function buildStatusDistribution(statuses: OrderStatus[]): StatusDistributionRow[] {
  const counts = new Map<OrderStatus, number>();
  for (const status of statuses) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...ORDER_STATUS_SEQUENCE, "cancelado" as OrderStatus].map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
}

/** Etapas de jornada que exigiriam rastreamento de eventos do cardápio (indisponível sem SDK). */
export const UNTRACKED_JOURNEY_STAGES = [
  "Acesso ao cardápio",
  "Visualização de categoria",
  "Visualização de produto",
  "Adição ao carrinho",
  "Início do checkout",
  "Preenchimento de endereço",
  "Seleção de pagamento",
];
