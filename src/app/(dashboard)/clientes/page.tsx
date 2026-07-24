import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { buildRfmSegmentation, computeCustomerStats, type CustomerOrderInput, type RfmSegment } from "@/lib/metrics/rfm";
import type { Brand, Store } from "@/types/database";

const MIN_SAMPLE_SIZE = 10;

const SEGMENT_VARIANT: Record<RfmSegment, "default" | "secondary" | "destructive" | "outline"> = {
  "Novos": "secondary",
  "Clientes fiéis": "default",
  "Clientes de alto valor": "default",
  "Em crescimento": "outline",
  "Em risco": "destructive",
  "Inativos": "outline",
  "Perdidos": "destructive",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function CustomersRfmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selectedBrandId = typeof params.brand === "string" ? params.brand : null;

  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : fallback)
    .returns<Brand[]>();

  const allBrandIds = (brands ?? []).map((b) => b.id);
  const brandIds = selectedBrandId && allBrandIds.includes(selectedBrandId) ? [selectedBrandId] : allBrandIds;

  const { data: stores } = await supabase
    .from("stores")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Store[]>();

  const storeIds = (stores ?? []).map((s) => s.id);
  const storeFallback = storeIds.length ? storeIds : fallback;

  // RFM usa todo o histórico sincronizado, não um período — ver METRICS.md.
  const { data: ordersRaw } = await supabase
    .from("orders")
    .select("customer_id, gross_amount, ordered_at")
    .in("store_id", storeFallback)
    .not("customer_id", "is", null);

  const customerOrders: CustomerOrderInput[] = (ordersRaw ?? []).map((o) => ({
    customer_id: o.customer_id as string,
    gross_amount: o.gross_amount,
    ordered_at: o.ordered_at,
  }));

  const now = new Date().toISOString();
  const stats = computeCustomerStats(customerOrders, now);
  const rfmRows = buildRfmSegmentation(stats).sort((a, b) => b.monetary - a.monetary);

  const customerIds = rfmRows.map((r) => r.customerId);
  const { data: customersRaw } = customerIds.length
    ? await supabase
        .from("customers")
        .select("id, full_name, phone_masked")
        .in("id", customerIds)
    : { data: [] };

  const customerById = new Map((customersRaw ?? []).map((c) => [c.id, c]));

  const segmentCounts = new Map<RfmSegment, number>();
  for (const row of rfmRows) {
    segmentCounts.set(row.segment, (segmentCounts.get(row.segment) ?? 0) + 1);
  }

  const lowSample = rfmRows.length < MIN_SAMPLE_SIZE;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes e RFM</h1>
          <p className="text-sm text-muted-foreground">
            Segmentação estimada por percentil de Recência, Frequência e Valor
            monetário — considera todo o histórico de pedidos identificados, não
            só um período.
          </p>
        </div>
        <BrandSelect brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} current={selectedBrandId} />
      </div>

      {lowSample && rfmRows.length > 0 && (
        <Card className="border-amber-400">
          <CardContent className="pt-6 text-sm text-amber-700">
            ⚠️ Apenas {rfmRows.length} cliente(s) identificado(s) — abaixo do mínimo
            recomendado ({MIN_SAMPLE_SIZE}) para os percentis de RFM serem
            representativos. Trate a segmentação abaixo como baixa confiança.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Segmentos</CardTitle>
          <CardDescription>{rfmRows.length} cliente(s) identificado(s) no escopo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Array.from(segmentCounts.entries()).map(([segment, count]) => (
            <Badge key={segment} variant={SEGMENT_VARIANT[segment]}>
              {segment}: {count}
            </Badge>
          ))}
          {rfmRows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum cliente identificado ainda (pedidos sem cliente vinculado não
              entram na base de RFM).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes</CardTitle>
          <CardDescription>Ordenado por valor monetário total.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Recência</TableHead>
                <TableHead className="text-right">Frequência</TableHead>
                <TableHead className="text-right">Valor total</TableHead>
                <TableHead>Segmento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfmRows.slice(0, 100).map((row) => {
                const customer = customerById.get(row.customerId);
                return (
                  <TableRow key={row.customerId}>
                    <TableCell className="whitespace-nowrap">{customer?.full_name ?? "Não identificado"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{customer?.phone_masked ?? "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {row.recencyDays === 0 ? "hoje" : `${row.recencyDays}d`}
                    </TableCell>
                    <TableCell className="text-right">{row.frequency}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(row.monetary)}</TableCell>
                    <TableCell>
                      <Badge variant={SEGMENT_VARIANT[row.segment]}>{row.segment}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rfmRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Nenhum cliente no escopo selecionado.
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
