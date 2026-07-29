import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listProductsViewerUsers } from "./actions";
import { NewAccessButton } from "./user-form";
import { ViewerUsersTable } from "./viewer-users-table";

const ROLE_LABELS: Record<string, string> = {
  admin_geral: "Administrador geral",
  gestor_marca: "Gestor de marca",
  gestor_loja: "Gestor de loja",
  analista: "Analista",
  somente_leitura: "Somente leitura",
  products_viewer: "Visualizador de produtos",
};

export default async function UsersPage() {
  const user = await getCurrentUser();
  const isAdmin = (user?.memberships ?? []).some((m) => m.role === "admin_geral");
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];

  const { data: memberships } = await supabase
    .from("user_organizations")
    .select("id, user_id, role, brand_id, store_id, organization_id")
    .in("organization_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"])
    .neq("role", "products_viewer");

  let stores: { id: string; name: string }[] = [];
  if (isAdmin) {
    const { data: brands } = await supabase.from("brands").select("id").in("organization_id", orgIds.length ? orgIds : ["-"]);
    const brandIds = (brands ?? []).map((b) => b.id);
    const { data: storeRows } = await supabase.from("stores").select("id, name").in("brand_id", brandIds.length ? brandIds : ["-"]);
    stores = storeRows ?? [];
  }

  const viewerUsers = isAdmin ? await listProductsViewerUsers() : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários e permissões</h1>
          <p className="text-sm text-muted-foreground">Gerencie acessos, funções e lojas permitidas no DOM Food Analytics.</p>
        </div>
        {isAdmin && <NewAccessButton stores={stores} />}
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visualizador de produtos</CardTitle>
            <CardDescription>Acesso restrito só a Produtos vendidos, por loja — sem e-mail, login por nome de usuário.</CardDescription>
          </CardHeader>
          <CardContent>
            <ViewerUsersTable users={viewerUsers} stores={stores} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipe administrativa</CardTitle>
          <CardDescription>Vínculos de organização, marca e loja da equipe com acesso completo.</CardDescription>
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
                    {m.store_id ? "Loja específica" : m.brand_id ? "Marca inteira" : "Organização inteira"}
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
