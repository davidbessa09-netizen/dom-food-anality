import { describe, expect, it } from "vitest";
import { autoMapColumns } from "@/lib/validations/column-mapping";
import { IMPORT_TEMPLATE_FIELDS } from "@/lib/validations/import";

describe("autoMapColumns", () => {
  it("mapeia cabeçalhos idênticos aos campos internos", () => {
    const headers = ["pedido_id", "data_pedido", "status", "valor_bruto"];
    const mapping = autoMapColumns(headers, IMPORT_TEMPLATE_FIELDS.pedidos);
    expect(mapping.pedido_id).toBe("pedido_id");
    expect(mapping.valor_bruto).toBe("valor_bruto");
  });

  it("mapeia sinônimos comuns em português", () => {
    const headers = ["Número do Pedido", "Data", "Situação", "Valor Total", "Forma de Pagamento"];
    const mapping = autoMapColumns(headers, IMPORT_TEMPLATE_FIELDS.pedidos);
    expect(mapping.pedido_id).toBe("Número do Pedido");
    expect(mapping.data_pedido).toBe("Data");
    expect(mapping.status).toBe("Situação");
    expect(mapping.valor_bruto).toBe("Valor Total");
    expect(mapping.forma_pagamento).toBe("Forma de Pagamento");
  });

  it("não usa a mesma coluna do arquivo para dois campos diferentes", () => {
    const headers = ["total"];
    const mapping = autoMapColumns(headers, ["valor_bruto", "valor_liquido"]);
    const mappedColumns = Object.values(mapping);
    expect(new Set(mappedColumns).size).toBe(mappedColumns.length);
  });

  it("deixa campo sem sugestão quando não há coluna correspondente", () => {
    const headers = ["coluna_aleatoria"];
    const mapping = autoMapColumns(headers, IMPORT_TEMPLATE_FIELDS.pedidos);
    expect(mapping.pedido_id).toBeUndefined();
  });
});
