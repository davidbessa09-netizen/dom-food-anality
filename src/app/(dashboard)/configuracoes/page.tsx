import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, timezone, is_demo")
    .in("id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Organização, fuso horário e status de dados de demonstração.
        </p>
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
              {org.is_demo && <Badge className="bg-amber-400 text-amber-950">DEMONSTRAÇÃO</Badge>}
            </div>
          ))}
          {(orgs ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma organização vinculada ao seu usuário.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limpeza de dados de demonstração</CardTitle>
          <CardDescription>
            Ação administrativa (implementada na Fase 6) que remove em cascata todas as
            organizações marcadas como demonstração antes de operar com dados reais.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
