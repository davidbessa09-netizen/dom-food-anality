import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";

const ROLE_LABELS: Record<string, string> = {
  admin_geral: "Administrador geral",
  gestor_marca: "Gestor de marca",
  gestor_loja: "Gestor de loja",
  analista: "Analista",
  somente_leitura: "Somente leitura",
};

export default async function UsersPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];

  const { data: memberships } = await supabase
    .from("user_organizations")
    .select("id, user_id, role, brand_id, store_id, organization_id")
    .in("organization_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários e permissões</h1>
        <p className="text-sm text-muted-foreground">
          Vínculos de usuário por organização, marca e loja. RLS garante que um
          gestor de loja não veja dados de outra marca, mesmo que a tela falhe em
          filtrar corretamente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vínculos</CardTitle>
          <CardDescription>
            Gestão completa (convite, edição, remoção) é implementada na Fase 6, junto
            com o restante do endurecimento de segurança. Por ora, vínculos são
            criados via SQL/painel do Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário (ID)</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Escopo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(memberships ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.user_id}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ROLE_LABELS[m.role] ?? m.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.store_id
                      ? "Loja específica"
                      : m.brand_id
                        ? "Marca inteira"
                        : "Organização inteira"}
                  </TableCell>
                </TableRow>
              ))}
              {(memberships ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    Nenhum vínculo encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
