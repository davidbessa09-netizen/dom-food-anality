import { describe, expect, it } from "vitest";
import { mapAnotaAiFulfillment, mapAnotaAiStatus, toNormalizedAnotaAiOrder } from "@/lib/integrations/anota-ai/mapping";
import type { AnotaAiOrder } from "@/lib/integrations/anota-ai/types";

describe("mapAnotaAiStatus", () => {
  it("mapeia cada valor de check para o status interno esperado", () => {
    expect(mapAnotaAiStatus(-2)).toBe("confirmado");
    expect(mapAnotaAiStatus(0)).toBe("criado");
    expect(mapAnotaAiStatus(1)).toBe("em_preparo");
    expect(mapAnotaAiStatus(2)).toBe("saiu_para_entrega");
    expect(mapAnotaAiStatus(3)).toBe("concluido");
    expect(mapAnotaAiStatus(4)).toBe("cancelado");
    expect(mapAnotaAiStatus(5)).toBe("cancelado");
    expect(mapAnotaAiStatus(6)).toBe("cancelado");
  });

  it("usa 'criado' como fallback para valor desconhecido", () => {
    expect(mapAnotaAiStatus(999)).toBe("criado");
  });
});

describe("mapAnotaAiFulfillment", () => {
  it("mapeia os três tipos de retirada", () => {
    expect(mapAnotaAiFulfillment("DELIVERY")).toBe("entrega");
    expect(mapAnotaAiFulfillment("TAKE")).toBe("retirada");
    expect(mapAnotaAiFulfillment("LOCAL")).toBe("consumo_local");
  });
});

const sampleOrder: AnotaAiOrder = {
  _id: "6662122e4aad3d001222a1bf",
  id: "6662122e4aad3d001222a1bf",
  check: 3,
  additionalFees: [{ type: "waiter_tip", description: "Taxa do garçom", value: 1 }],
  customer: { id: "64ccf483fac3cd001215581d", name: "Teste", phone: "9999999999" },
  deliveryFee: 0,
  discounts: [{ amount: 5, tag: "CUPOMTESTE" }],
  items: [
    {
      _id: "666212370ffae60fbc130cf6",
      id: 0,
      name: "Refrigerante 1L",
      quantity: 1,
      externalId: "|3|",
      internalId: "65d4a428f784bb001956f919",
      price: 10,
      total: 10,
      subItems: [{ name: "Sem açúcar", quantity: 1, totalPrice: 0, unitPrice: 0 }],
    },
  ],
  menu_version: 2,
  merchant: { name: null, id: "65d4a42443b0de0019666da1", unit: "65d4a42543b0de0019666db0" },
  observation: null,
  payments: [{ name: "money", code: "money", value: "11", prepaid: false }],
  pdv: { status: false },
  preparationStartDateTime: "2024-06-06T19:46:54.066Z",
  qr_description: "Mesa 1",
  salesChannel: "anotaai",
  shortReference: 441,
  total: 11,
  type: "LOCAL",
  createdAt: "2024-06-06T19:46:54.066Z",
  updatedAt: "2024-06-06T19:47:03.217Z",
  order_automatic_accept: false,
};

describe("toNormalizedAnotaAiOrder", () => {
  const context = { store_id: "store-1", sales_channel_id: "channel-1", connectorVersion: "1.0.0" };

  it("converte os campos básicos corretamente", () => {
    const normalized = toNormalizedAnotaAiOrder(sampleOrder, context);
    expect(normalized.source_platform).toBe("anota_ai");
    expect(normalized.source_external_id).toBe(sampleOrder._id);
    expect(normalized.status).toBe("concluido");
    expect(normalized.fulfillment_type).toBe("consumo_local");
    expect(normalized.gross_amount).toBe(11);
    expect(normalized.discount_amount).toBe(5);
    expect(normalized.payment_method).toBe("money");
  });

  it("inclui o item principal e o subitem como itens separados", () => {
    const normalized = toNormalizedAnotaAiOrder(sampleOrder, context);
    expect(normalized.items).toHaveLength(2);
    expect(normalized.items[0].original_name).toBe("Refrigerante 1L");
    expect(normalized.items[1].is_addon).toBe(true);
  });

  it("não define cancellation_reason para pedidos concluídos", () => {
    const normalized = toNormalizedAnotaAiOrder(sampleOrder, context);
    expect(normalized.cancellation_reason).toBeUndefined();
  });

  it("define cancellation_reason para pedidos negados/cancelados", () => {
    const denied = { ...sampleOrder, check: 5 };
    const normalized = toNormalizedAnotaAiOrder(denied, context);
    expect(normalized.status).toBe("cancelado");
    expect(normalized.cancellation_reason).toContain("Negado");
  });

  it("extrai o bairro do endereço de entrega quando presente", () => {
    const withAddress = { ...sampleOrder, deliveryAddress: { neighborhood: "Centro" } };
    const normalized = toNormalizedAnotaAiOrder(withAddress, context);
    expect(normalized.neighborhood_raw).toBe("Centro");
  });

  it("deixa neighborhood_raw indefinido quando não há endereço de entrega", () => {
    const normalized = toNormalizedAnotaAiOrder(sampleOrder, context);
    expect(normalized.neighborhood_raw).toBeUndefined();
  });
});
