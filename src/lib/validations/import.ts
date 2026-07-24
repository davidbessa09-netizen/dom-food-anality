import { z } from "zod";
import { parseFlexibleNumber } from "./number-format";

// Schemas de validação por linha de planilha, usados tanto na importação
// quanto na geração dos modelos de download (IMPORT_GUIDE.md).

export const importTypeSchema = z.enum([
  "pedidos",
  "produtos",
  "clientes",
  "cancelamentos",
  "cardapio",
  "financeiro",
]);
export type ImportType = z.infer<typeof importTypeSchema>;

const numberFromString = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || v.trim() === "") return undefined;
  return parseFlexibleNumber(v);
}, z.number());

const dateFromString = z.preprocess((v) => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v !== "string" || v.trim() === "") return undefined;
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}, z.string());

export const orderImportRowSchema = z.object({
  pedido_id: z.string().min(1, "Identificador do pedido é obrigatório"),
  data_pedido: dateFromString,
  status: z.string().min(1, "Status é obrigatório"),
  tipo_entrega: z.string().optional(),
  forma_pagamento: z.string().optional(),
  valor_bruto: numberFromString,
  desconto: numberFromString.optional().default(0),
  taxa_entrega: numberFromString.optional().default(0),
  valor_liquido: numberFromString.optional(),
  bairro: z.string().optional(),
  cliente_nome: z.string().optional(),
  cliente_telefone: z.string().optional(),
  cliente_email: z.string().optional(),
  motivo_cancelamento: z.string().optional(),
  itens: z.string().optional(), // "2x Combo Chef; 1x Refrigerante"
});
export type OrderImportRow = z.infer<typeof orderImportRowSchema>;

export const productImportRowSchema = z.object({
  nome: z.string().min(1, "Nome do produto é obrigatório"),
  categoria: z.string().optional(),
  preco: numberFromString.optional(),
});
export type ProductImportRow = z.infer<typeof productImportRowSchema>;

export const customerImportRowSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  telefone: z.string().optional(),
  email: z.string().optional(),
});
export type CustomerImportRow = z.infer<typeof customerImportRowSchema>;

export const cancellationImportRowSchema = z.object({
  pedido_id: z.string().min(1, "Identificador do pedido é obrigatório"),
  motivo: z.string().optional(),
  valor_reembolsado: numberFromString.optional().default(0),
  data_cancelamento: dateFromString,
});
export type CancellationImportRow = z.infer<typeof cancellationImportRowSchema>;

export const IMPORT_ROW_SCHEMAS: Record<ImportType, z.ZodTypeAny> = {
  pedidos: orderImportRowSchema,
  produtos: productImportRowSchema,
  cardapio: productImportRowSchema,
  clientes: customerImportRowSchema,
  cancelamentos: cancellationImportRowSchema,
  financeiro: orderImportRowSchema,
};

/** Campos esperados por tipo de importação — usado para gerar o modelo de planilha e a UI de mapeamento. */
export const IMPORT_TEMPLATE_FIELDS: Record<ImportType, string[]> = {
  pedidos: [
    "pedido_id",
    "data_pedido",
    "status",
    "tipo_entrega",
    "forma_pagamento",
    "valor_bruto",
    "desconto",
    "taxa_entrega",
    "valor_liquido",
    "bairro",
    "cliente_nome",
    "cliente_telefone",
    "cliente_email",
    "motivo_cancelamento",
    "itens",
  ],
  produtos: ["nome", "categoria", "preco"],
  cardapio: ["nome", "categoria", "preco"],
  clientes: ["nome", "telefone", "email"],
  cancelamentos: ["pedido_id", "motivo", "valor_reembolsado", "data_cancelamento"],
  financeiro: [
    "pedido_id",
    "data_pedido",
    "status",
    "tipo_entrega",
    "forma_pagamento",
    "valor_bruto",
    "desconto",
    "taxa_entrega",
    "valor_liquido",
    "bairro",
    "cliente_nome",
    "cliente_telefone",
    "cliente_email",
    "motivo_cancelamento",
    "itens",
  ],
};
