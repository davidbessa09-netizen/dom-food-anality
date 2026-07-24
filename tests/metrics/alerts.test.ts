import { describe, expect, it } from "vitest";
import { buildSyncAlerts, type IntegrationHealthInput, type RecentSyncJobInput } from "@/lib/metrics/alerts";

const now = "2026-07-24T12:00:00Z";

function integration(overrides: Partial<IntegrationHealthInput> = {}): IntegrationHealthInput {
  return {
    integrationId: "int-1",
    label: "Loja A",
    lastSyncedAt: "2026-07-24T11:55:00Z",
    isActive: true,
    ...overrides,
  };
}

describe("buildSyncAlerts", () => {
  it("não gera alerta para integração saudável", () => {
    const alerts = buildSyncAlerts({
      integrations: [integration()],
      recentJobs: [],
      now,
      staleThresholdMinutes: 60,
    });
    expect(alerts).toEqual([]);
  });

  it("ignora integrações inativas", () => {
    const alerts = buildSyncAlerts({
      integrations: [integration({ isActive: false, lastSyncedAt: null })],
      recentJobs: [],
      now,
      staleThresholdMinutes: 60,
    });
    expect(alerts).toEqual([]);
  });

  it("alerta quando a integração nunca sincronizou", () => {
    const alerts = buildSyncAlerts({
      integrations: [integration({ lastSyncedAt: null })],
      recentJobs: [],
      now,
      staleThresholdMinutes: 60,
    });
    expect(alerts.find((a) => a.id === "never-synced-int-1")).toBeDefined();
  });

  it("alerta média severidade quando passou do threshold mas não do dobro", () => {
    const alerts = buildSyncAlerts({
      integrations: [integration({ lastSyncedAt: "2026-07-24T10:30:00Z" })], // 90min atrás
      recentJobs: [],
      now,
      staleThresholdMinutes: 60,
    });
    const alert = alerts.find((a) => a.id === "stale-int-1");
    expect(alert?.severity).toBe("media");
  });

  it("alerta alta severidade quando passou do dobro do threshold", () => {
    const alerts = buildSyncAlerts({
      integrations: [integration({ lastSyncedAt: "2026-07-24T09:00:00Z" })], // 180min atrás
      recentJobs: [],
      now,
      staleThresholdMinutes: 60,
    });
    const alert = alerts.find((a) => a.id === "stale-int-1");
    expect(alert?.severity).toBe("alta");
  });

  it("alerta quando a última sincronização falhou, citando o erro real", () => {
    const recentJobs: RecentSyncJobInput[] = [
      { integrationId: "int-1", status: "failed", errorSummary: "Anota AI respondeu 401", recordsFailed: 0, startedAt: "2026-07-24T11:56:00Z" },
    ];
    const alerts = buildSyncAlerts({ integrations: [integration()], recentJobs, now, staleThresholdMinutes: 60 });
    const alert = alerts.find((a) => a.id === "failed-int-1");
    expect(alert?.severity).toBe("alta");
    expect(alert?.description).toBe("Anota AI respondeu 401");
  });

  it("usa apenas o job mais recente por integração", () => {
    const recentJobs: RecentSyncJobInput[] = [
      { integrationId: "int-1", status: "failed", errorSummary: "erro antigo", recordsFailed: 0, startedAt: "2026-07-24T10:00:00Z" },
      { integrationId: "int-1", status: "success", errorSummary: null, recordsFailed: 0, startedAt: "2026-07-24T11:56:00Z" },
    ];
    const alerts = buildSyncAlerts({ integrations: [integration()], recentJobs, now, staleThresholdMinutes: 60 });
    expect(alerts.find((a) => a.id === "failed-int-1")).toBeUndefined();
  });

  it("alerta sincronização parcial com contagem real de falhas", () => {
    const recentJobs: RecentSyncJobInput[] = [
      { integrationId: "int-1", status: "partial_success", errorSummary: null, recordsFailed: 3, startedAt: "2026-07-24T11:56:00Z" },
    ];
    const alerts = buildSyncAlerts({ integrations: [integration()], recentJobs, now, staleThresholdMinutes: 60 });
    const alert = alerts.find((a) => a.id === "partial-int-1");
    expect(alert?.description).toContain("3 registro(s)");
  });
});
