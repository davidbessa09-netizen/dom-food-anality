import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Topbar } from "@/components/dashboard/topbar";
import { DemoBanner } from "@/components/dashboard/demo-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  let isDemo = false;
  if (user.memberships.length > 0) {
    const supabase = await createClient();
    const orgIds = [...new Set(user.memberships.map((m) => m.organization_id))];
    const { data: orgs } = await supabase
      .from("organizations")
      .select("is_demo")
      .in("id", orgIds);
    isDemo = (orgs ?? []).some((o) => o.is_demo);
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <SidebarNav />
      <div className="flex flex-1 flex-col overflow-hidden">
        {isDemo && <DemoBanner />}
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
