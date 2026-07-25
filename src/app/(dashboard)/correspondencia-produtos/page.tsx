import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { VariantsTabContent } from "@/components/produtos/variants-tab-content";

export default async function ProductMatchingPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase
    .from("brands")
    .select("id")
    .in("organization_id", orgIds.length ? orgIds : fallback);

  const brandIds = (brands ?? []).map((b) => b.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Correspondência de produtos</h1>
      </div>
      <VariantsTabContent brandIds={brandIds} />
    </div>
  );
}
