import { describe, expect, it } from "vitest";
import { isBarFacilEstorno, parseBarFacilDate, toNormalizedBarFacilOrder } from "@/lib/integrations/bar-facil/mapping";
import type { BarFacilVenda } from "@/lib/integrations/bar-facil/types";

function buildVenda(overrides: Partial<BarFacilVenda> = {}): BarFacilVenda {
  return {
    codVenda: 10259,
    codVendaTerminal: 6,
    codTerminal: 3,
    codEmpresa: 240,
    codEvento: 30,
    atendente: { codAtendente: 1, nome: "ATENDENTE 1", comissao: 10 },
    dtVenda: "2020-02-15 16:18:26",
    tipo: "Venda",
    setor: null,
    cpf: null,
    chaveNfce: null,
    pessoa: null,
    items: [
      {
        codItemVenda: 205022,
        produto: { codProduto: 4, descricao: "AGUA'S''P", categoria: "CATEGORIA 06", vlrCusto: 4.0 },
        nmTicket: 6,
        qtdItem: 3,
        vlrItem: 18.0,
        vlrItemUnitario: 6.0,
        vlrItemComissao: 1.8,
        vlrItemComissaoUnitario: 0.6,
        cortesia: false,
      },
    ],
    pagamentos: [{ codFormaPagamento: 1, formaPagamento: "DINHEIRO", dtPagamento: "2020-02-15 16:18:26", vlrPagamento: "6.60" }],
    ...overrides,
  };
}

describe("isBarFacilEstorno", () => {
  it("venda normal (valores positivos) não é estorno", () => {
    expect(isBarFacilEstorno(buildVenda())).toBe(false);
  });

  it("venda com valores negativos é estorno (nota literal da documentação)", () => {
    const venda = buildVenda({
      items: [
        {
          codItemVenda: 1,
          produto: { codProduto: 4, descricao: "AGUA", categoria: null },
          qtdItem: -3,
          vlrItem: -18.0,
          vlrItemUnitario: -6.0,
        },
      ],
    });
    expect(isBarFacilEstorno(venda)).toBe(true);
  });
});

describe("parseBarFacilDate", () => {
  it("interpreta dtVenda como horário LOCAL do estabelecimento, não UTC (bug confirmado ao vivo em 2026-08-12: tratar como UTC deslocava a venda em 3h)", () => {
    const result = parseBarFacilDate("2026-08-12 17:34:24", "America/Sao_Paulo");
    // 17:34:24 em America/Sao_Paulo (UTC-3, sem horário de verão) equivale a 20:34:24 UTC.
    expect(new Date(result).toISOString()).toBe("2026-08-12T20:34:24.000Z");
  });
});

describe("toNormalizedBarFacilOrder", () => {
  const context = { store_id: "store-1", sales_channel_id: "channel-1", connectorVersion: "1.0.0", timezone: "America/Sao_Paulo" };

  it("mapeia uma venda normal como concluída", () => {
    const result = toNormalizedBarFacilOrder(buildVenda(), context);
    expect(result.source_platform).toBe("bar_facil");
    expect(result.source_external_id).toBe("10259");
    expect(result.status).toBe("concluido");
    expect(result.gross_amount).toBe(18);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ original_name: "AGUA'S''P", quantity: 3, unit_price: 6, total_price: 18 });
    expect(result.payment_method).toBe("DINHEIRO");
  });

  it("mapeia um estorno (valores negativos) como cancelado, sem inverter os valores exibidos", () => {
    const venda = buildVenda({
      items: [
        {
          codItemVenda: 1,
          produto: { codProduto: 4, descricao: "AGUA", categoria: null },
          qtdItem: -3,
          vlrItem: -18.0,
          vlrItemUnitario: -6.0,
        },
      ],
    });
    const result = toNormalizedBarFacilOrder(venda, context);
    expect(result.status).toBe("cancelado");
    expect(result.gross_amount).toBe(18); // valor absoluto — nunca negativo no modelo canônico
    expect(result.items[0].quantity).toBe(3);
    expect(result.cancellation_reason).toBeTruthy();
  });

  it("nunca deixa a fonte/ID externo ambíguos entre chamadas", () => {
    const a = toNormalizedBarFacilOrder(buildVenda({ codVenda: 1 }), context);
    const b = toNormalizedBarFacilOrder(buildVenda({ codVenda: 2 }), context);
    expect(a.source_external_id).not.toBe(b.source_external_id);
  });

  it("aceita valores como string (confirmado ao vivo em 2026-08-07: a API real devolve qtdItem/vlrItem como string)", () => {
    const venda = buildVenda({
      codEvento: null,
      items: [
        {
          codItemVenda: 431769892,
          produto: { codProduto: 737075, descricao: "TORRE PILSEN", categoria: "CERVEJAS", vlrCusto: "55.00" },
          qtdItem: "1.000",
          vlrItem: "64.90",
          vlrItemUnitario: "64.90",
        },
      ],
    });
    const result = toNormalizedBarFacilOrder(venda, context);
    expect(result.gross_amount).toBe(64.9);
    expect(result.items[0]).toMatchObject({ quantity: 1, unit_price: 64.9, total_price: 64.9 });
  });
});
