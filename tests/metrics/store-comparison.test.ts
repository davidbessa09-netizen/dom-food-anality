import { describe, expect, it } from "vitest";
import { classifyStoreDataStatus, isEligibleForRanking } from "@/lib/metrics/store-comparison";

describe("classifyStoreDataStatus", () => {
  it("marca loja inativa mesmo com canal saudável", () => {
    const status = classifyStoreDataStatus({
      storeIsActive: false,
      channels: [{ isActive: true, lastSyncedAt: "2026-01-01T00:00:00Z" }],
      ordersInPeriodCount: 10,
    });
    expect(status).toBe("loja_inativa");
  });

  it("marca integração incompleta quando nenhum canal ativo já sincronizou", () => {
    const status = classifyStoreDataStatus({
      storeIsActive: true,
      channels: [{ isActive: true, lastSyncedAt: null }],
      ordersInPeriodCount: 0,
    });
    expect(status).toBe("integracao_incompleta");
  });

  it("marca integração incompleta quando não há nenhum canal", () => {
    const status = classifyStoreDataStatus({
      storeIsActive: true,
      channels: [],
      ordersInPeriodCount: 0,
    });
    expect(status).toBe("integracao_incompleta");
  });

  it("marca sem pedidos no período quando a integração é confiável mas o total é zero", () => {
    const status = classifyStoreDataStatus({
      storeIsActive: true,
      channels: [{ isActive: true, lastSyncedAt: "2026-01-01T00:00:00Z" }],
      ordersInPeriodCount: 0,
    });
    expect(status).toBe("sem_pedidos_periodo");
  });

  it("marca operacional quando há pedidos e integração confiável", () => {
    const status = classifyStoreDataStatus({
      storeIsActive: true,
      channels: [{ isActive: true, lastSyncedAt: "2026-01-01T00:00:00Z" }],
      ordersInPeriodCount: 5,
    });
    expect(status).toBe("operacional");
  });

  it("só operacional e sem_pedidos_periodo são elegíveis pra ranking", () => {
    expect(isEligibleForRanking("operacional")).toBe(true);
    expect(isEligibleForRanking("sem_pedidos_periodo")).toBe(true);
    expect(isEligibleForRanking("integracao_incompleta")).toBe(false);
    expect(isEligibleForRanking("loja_inativa")).toBe(false);
  });
});
