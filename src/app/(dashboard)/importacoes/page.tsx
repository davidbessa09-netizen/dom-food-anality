import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ImportWizard } from "./import-wizard";
import { ImportRowActions } from "./import-row-actions";
import type { Brand, Import, SalesChannel, Store } from "@/types/database";

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  processando: "Processando",
  concluido: "Concluído",
  concluido_com_erros: "Concluído com erros",
  falhou: "Falhou",
  desfeito: "Desfeito",
};

function statusVariant(status: string): "default" | "destructive" | "secondary" | "outline" {
  if (status === "concluido") return "default";
  if (status === "falhou") return "destructive";
  if (status === "concluido_com_erros") return "secondary";
  return "outline";
}

export default async function ImportsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .returns<Brand[]>();

  const brandIds = (brands ?? []).map((b) => b.id);

  const { data: stores } = await supabase
    .from("stores")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Store[]>();

  const storeIds = (stores ?? []).map((s) => s.id);

  const { data: channels } = await supabase
    .from("sales_channels")
    .select("*")
    .in("store_id", storeIds.length ? storeIds : fallback)
    .returns<SalesChannel[]>();

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));

  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    brandName: brandById.get(s.brand_id)?.name ?? "",
    channels: (channels ?? [])
      .filter((c) => c.store_id === s.id)
      .map((c) => ({ id: c.id, platform: c.platform })),
  }));

  const { data: imports } = await supabase
    .from("imports")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<Import[]>();

  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importações</h1>
        <p className="text-sm text-muted-foreground">
          Caminho garantido de dados enquanto a API do Anota AI/iFood não está
          liberada (ver INTEGRATIONS.md). Suporta apenas o modelo de Pedidos por
          enquanto — os demais modelos chegam junto com suas respectivas telas.
        </p>
      </div>

      <ImportWizard stores={storeOptions} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de importações</CardTitle>
          <CardDescription>Últimas 20 importações desta organização.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Linhas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(imports ?? []).map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell className="font-medium">{imp.file_name}</TableCell>
                  <TableCell>{imp.store_id ? storeById.get(imp.store_id)?.name ?? "—" : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(imp.status)}>{STATUS_LABELS[imp.status] ?? imp.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {imp.rows_imported}/{imp.rows_total} importada(s)
                    {imp.rows_failed > 0 ? `, ${imp.rows_failed} com erro` : ""}
                  </TableCell>
                  <TableCell>
                    <ImportRowActions
                      importId={imp.id}
                      canUndo={imp.status !== "desfeito" && !imp.undone_at}
                      hasErrors={imp.rows_failed > 0}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {(imports ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Nenhuma importação realizada ainda.
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
