import { describe, expect, it } from "vitest";
import { BarFacilConnector } from "@/lib/integrations/bar-facil/connector";
import { ConnectorNotImplementedError } from "@/lib/integrations/connector";

/**
 * O conector do Bar Fácil já implementa os endpoints confirmados pela
 * documentação oficial recebida em 2026-08-03 (eventos, atendentes,
 * produtos, vendas). Sem token configurado, nenhum método real deve
 * fingir sucesso — e os métodos SEM endpoint confirmado (itens/pagamentos
 * separados, estoque, clientes, sync orquestrado) continuam lançando
 * ConnectorNotImplementedError, nunca inventando dado.
 */
describe("BarFacilConnector (implementação real, sem token)", () => {
  const connector = new BarFacilConnector({});

  it("nunca reporta conexão ok sem token cadastrado", async () => {
    const status = await connector.testConnection();
    expect(status.ok).toBe(false);
  });

  it("healthCheck nunca lança, mesmo sem credenciais", async () => {
    await expect(connector.healthCheck()).resolves.toMatchObject({ ok: false });
  });

  it("listOrganizations/listStores/listProducts/listSales exigem token (nunca inventam dado)", async () => {
    await expect(connector.listOrganizations()).rejects.toThrow(/token/i);
    await expect(connector.listStores()).rejects.toThrow(/token/i);
    await expect(connector.listProducts()).rejects.toThrow(/token/i);
    await expect(connector.listSales({ storeId: "35" })).rejects.toThrow(/token/i);
    await expect(connector.listRefunds({ storeId: "35" })).rejects.toThrow(/token/i);
  });

  it.each([
    ["listSaleItems", () => connector.listSaleItems({ saleExternalId: "x" })],
    ["listPayments", () => connector.listPayments({})],
    ["listStockMovements", () => connector.listStockMovements({})],
    ["listCustomers", () => connector.listCustomers?.({})],
    ["sync", () => connector.sync("manual")],
    ["backfill", () => connector.backfill({ from: "2026-01-01", to: "2026-01-02" })],
  ])("%s continua sem endpoint confirmado — lança ConnectorNotImplementedError", async (_name, call) => {
    await expect(call()).rejects.toBeInstanceOf(ConnectorNotImplementedError);
  });
});
