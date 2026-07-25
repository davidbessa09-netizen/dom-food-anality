export interface FilterOption {
  value: string;
  label: string;
}

export type ComparisonMode = "none" | "previous_period" | "previous_year";

export const CHANNEL_OPTIONS: FilterOption[] = [
  { value: "anota_ai", label: "Anota AI" },
  { value: "ifood", label: "iFood" },
  { value: "csv_import", label: "Importação CSV" },
  { value: "event_tracking", label: "Rastreamento próprio" },
];

export const ORDER_STATUS_OPTIONS: FilterOption[] = [
  { value: "criado", label: "Criado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_preparo", label: "Em preparo" },
  { value: "saiu_para_entrega", label: "Saiu para entrega" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

export const FULFILLMENT_OPTIONS: FilterOption[] = [
  { value: "entrega", label: "Entrega" },
  { value: "retirada", label: "Retirada" },
  { value: "consumo_local", label: "Consumo local" },
];

export const COMPARISON_OPTIONS: { value: ComparisonMode; label: string }[] = [
  { value: "none", label: "Sem comparação" },
  { value: "previous_period", label: "Período anterior" },
  { value: "previous_year", label: "Mesmo período do ano anterior" },
];
