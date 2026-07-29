import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BRAND, copyrightLine } from "@/lib/brand";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, timezone")
    .in("id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Organização e fuso horário.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organizações</CardTitle>
          <CardDescription>Fuso horário padrão: America/Sao_Paulo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(orgs ?? []).map((org) => (
            <div key={org.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">{org.name}</p>
                <p className="text-xs text-muted-foreground">{org.timezone}</p>
              </div>
            </div>
          ))}
          {(orgs ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma organização vinculada ao seu usuário.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sobre</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">{BRAND.name}</p>
          <p className="text-muted-foreground">{BRAND.description}</p>
          <p className="text-muted-foreground">Desenvolvido por {BRAND.developer}</p>
          <p className="text-muted-foreground">Versão: {BRAND.version}</p>
          <p className="pt-2 text-xs text-muted-foreground">{copyrightLine()}</p>
        </CardContent>
      </Card>
    </div>
  );
}
