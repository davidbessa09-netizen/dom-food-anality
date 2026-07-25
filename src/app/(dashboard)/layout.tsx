import { redirect } from "next/navigation";
import { subDays } from "date-fns";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Topbar } from "@/components/dashboard/topbar";
import { DemoBanner } from "@/components/dashboard/demo-banner";
import { buildSyncAlerts, type IntegrationHealthInput, type RecentSyncJobInput } from "@/lib/metrics/alerts";

interface IntegrationRow {
  id: string;
  sales_channel_id: string;
  last_synced_at: string | null;
  is_active: boolean;
}

interface SyncJobRow {
  integration_id: string;
  status: string;
  error_summary: string | null;
  records_failed: number;
  started_at: string;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.memberships.some((m) => m.role === "admin_geral");

  let isDemo = false;
  let organizations: { id: string; name: string }[] = [];
  let lastSyncedAt: string | null = null;
  let alertsCount = 0;

  if (user.memberships.length > 0) {
    const supabase = await createClient();
    const orgIds = [...new Set(user.memberships.map((m) => m.organization_id))];

    const { data: orgs } = await supabase.from("organizations").select("id, name, is_demo").in("id", orgIds);
    isDemo = (orgs ?? []).some((o) => o.is_demo);
    organizations = (orgs ?? []).map((o) => ({ id: o.id, name: o.name }));

    const { data: brands } = await supabase.from("brands").select("id").in("organization_id", orgIds);
    const brandIds = (brands ?? []).map((b) => b.id);

    const { data: stores } = await supabase.from("stores").select("id").in("brand_id", brandIds.length ? brandIds : ["-"]);
    const storeIds = (stores ?? []).map((s) => s.id);

    const { data: channels } = await supabase
      .from("sales_channels")
      .select("id")
      .in("store_id", storeIds.length ? storeIds : ["-"]);
    const channelIds = (channels ?? []).map((c) => c.id);

    const { data: integrations } = await supabase
      .from("integrations")
      .select("id, sales_channel_id, last_synced_at, is_active")
      .in("sales_channel_id", channelIds.length ? channelIds : ["-"])
      .returns<IntegrationRow[]>();

    const activeSyncedDates = (integrations ?? [])
      .filter((i) => i.is_active && i.last_synced_at)
      .map((i) => i.last_synced_at as string);
    lastSyncedAt = activeSyncedDates.length > 0 ? activeSyncedDates.sort().at(-1)! : null;

    const integrationIds = (integrations ?? []).map((i) => i.id);
    const since = subDays(new Date(), 1).toISOString();
    const { data: recentJobs } = await supabase
      .from("sync_jobs")
      .select("integration_id, status, error_summary, records_failed, started_at")
      .in("integration_id", integrationIds.length ? integrationIds : ["-"])
      .gte("started_at", since)
      .returns<SyncJobRow[]>();

    const integrationInputs: IntegrationHealthInput[] = (integrations ?? []).map((i) => ({
      integrationId: i.id,
      label: "",
      lastSyncedAt: i.last_synced_at,
      isActive: i.is_active,
    }));
    const recentJobInputs: RecentSyncJobInput[] = (recentJobs ?? []).map((j) => ({
      integrationId: j.integration_id,
      status: j.status,
      errorSummary: j.error_summary,
      recordsFailed: j.records_failed,
      startedAt: j.started_at,
    }));

    alertsCount = buildSyncAlerts({
      integrations: integrationInputs,
      recentJobs: recentJobInputs,
      now: new Date().toISOString(),
      staleThresholdMinutes: 60,
    }).length;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <SidebarNav
        organizationName={organizations[0]?.name ?? null}
        email={user.email ?? "—"}
        role={user.memberships[0]?.role}
        isAdmin={isAdmin}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {isDemo && <DemoBanner />}
        <Topbar
          isAdmin={isAdmin}
          email={user.email ?? "—"}
          role={user.memberships[0]?.role}
          organizations={organizations}
          lastSyncedAt={lastSyncedAt}
          alertsCount={alertsCount}
        />
        <main className="flex-1 overflow-y-auto bg-muted/20 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
