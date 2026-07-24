/**
 * Auto-detecção de colunas para a importação de CSV/Excel. Isto é apenas uma
 * heurística de sinônimos comuns em português/inglês para agilizar o
 * mapeamento manual — nunca decide sozinha, o usuário sempre confirma o
 * mapeamento antes de importar (ver IMPORT_GUIDE.md).
 */

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const FIELD_ALIASES: Record<string, string[]> = {
  pedido_id: [
    "pedido_id",
    "id_pedido",
    "id",
    "pedido",
    "numero_pedido",
    "numero_do_pedido",
    "num_pedido",
    "n_pedido",
    "nº_pedido",
    "codigo_pedido",
    "codigo_do_pedido",
    "order_id",
    "order",
  ],
  data_pedido: [
    "data_pedido",
    "data_do_pedido",
    "data",
    "data_criacao",
    "data_de_criacao",
    "criado_em",
    "date",
    "order_date",
  ],
  status: ["status", "situacao", "status_pedido", "status_do_pedido", "estado"],
  tipo_entrega: [
    "tipo_entrega",
    "tipo_de_entrega",
    "entrega",
    "modalidade",
    "modalidade_entrega",
    "delivery_type",
    "fulfillment",
  ],
  forma_pagamento: [
    "forma_pagamento",
    "forma_de_pagamento",
    "pagamento",
    "metodo_pagamento",
    "metodo_de_pagamento",
    "payment_method",
    "payment",
  ],
  valor_bruto: [
    "valor_bruto",
    "valor_total",
    "valor_do_pedido",
    "total",
    "total_pedido",
    "valor",
    "subtotal",
    "amount",
    "gross_amount",
  ],
  desconto: ["desconto", "descontos", "valor_desconto", "discount", "discount_amount"],
  taxa_entrega: [
    "taxa_entrega",
    "taxa_de_entrega",
    "frete",
    "valor_frete",
    "delivery_fee",
    "shipping_fee",
  ],
  valor_liquido: [
    "valor_liquido",
    "liquido",
    "valor_recebido",
    "repasse",
    "net_amount",
    "net",
  ],
  bairro: ["bairro", "neighborhood", "regiao", "bairro_entrega"],
  cliente_nome: [
    "cliente_nome",
    "nome_cliente",
    "nome_do_cliente",
    "cliente",
    "nome",
    "customer_name",
    "customer",
  ],
  cliente_telefone: [
    "cliente_telefone",
    "telefone_cliente",
    "telefone_do_cliente",
    "telefone",
    "celular",
    "whatsapp",
    "phone",
    "phone_number",
  ],
  cliente_email: ["cliente_email", "email_cliente", "email_do_cliente", "email", "e_mail"],
  motivo_cancelamento: [
    "motivo_cancelamento",
    "motivo_do_cancelamento",
    "motivo",
    "cancelamento",
    "reason",
    "cancellation_reason",
  ],
  itens: ["itens", "produtos", "items", "descricao_itens", "descricao_dos_itens", "products"],
  nome: ["nome", "nome_produto", "produto", "name", "product_name"],
  categoria: ["categoria", "category", "categoria_produto"],
  preco: ["preco", "preço", "valor", "price", "valor_unitario"],
  telefone: ["telefone", "celular", "whatsapp", "phone"],
  email: ["email", "e_mail"],
  valor_reembolsado: ["valor_reembolsado", "reembolso", "refund", "refund_amount"],
  data_cancelamento: ["data_cancelamento", "data_do_cancelamento", "cancelled_at"],
  motivo: ["motivo", "motivo_cancelamento", "reason"],
};

/**
 * Sugere, para cada campo interno, qual coluna do arquivo corresponde —
 * usando correspondência exata primeiro e, se não encontrar, comparando a
 * lista de sinônimos normalizada. Cada coluna do arquivo só é usada uma vez.
 */
export function autoMapColumns(headers: string[], fields: string[]): Record<string, string> {
  const available = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }));
  const used = new Set<string>();
  const mapping: Record<string, string> = {};

  for (const field of fields) {
    const aliases = FIELD_ALIASES[field] ?? [field];
    const match = available.find(
      (h) => !used.has(h.original) && aliases.includes(h.normalized)
    );
    if (match) {
      mapping[field] = match.original;
      used.add(match.original);
    }
  }

  return mapping;
}
