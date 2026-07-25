import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ProductForm } from "./product-form";
import { ProductsTable } from "./products-table";
import { BrandSelect } from "@/components/dashboard/brand-select";
import { CategorySelect } from "@/components/dashboard/category-select";
import { PeriodSelect } from "@/components/dashboard/period-select";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { isPeriodPreset, resolveCustomPeriod, resolvePeriod, type PeriodPreset } from "@/lib/dates/period";
import {
  buildProductRanking,
  daysSinceLastSale,
  findProductsWithoutSales,
  rankByQuantity,
  rankByRevenue,
  type ProductOrderItemInput,
} from "@/lib/metrics/products";
import type { Brand, Category, Product } from "@/types/database";

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawPeriod = typeof params.period === "string" ? params.period : "30d";
  const preset: PeriodPreset = isPeriodPreset(rawPeriod) ? rawPeriod : "30d";
  const selectedBrandId = typeof params.brand === "string" ? params.brand : null;
  const selectedCategoryId = typeof params.category === "string" ? params.category : null;
  const customFrom = typeof params.from === "string" ? params.from : undefined;
  const customTo = typeof params.to === "string" ? params.to : undefined;
  const period = customFrom && customTo ? resolveCustomPeriod(customFrom, customTo) : resolvePeriod(preset);

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

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .returns<Category[]>();

  const categoryIds = (categories ?? []).map((c) => c.id);
  const validSelectedCategoryId = selectedCategoryId && categoryIds.includes(selectedCategoryId) ? selectedCategoryId : null;

  let productsQuery = supabase
    .from("products")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : fallback)
    .order("canonical_name");
  if (validSelectedCategoryId) {
    productsQuery = productsQuery.eq("category_id", validSelectedCategoryId);
  }
  const { data: products } = await productsQuery.returns<Product[]>();

  const { data: stores } = await supabase
    .from("stores")
    .select("id")
    .in("brand_id", brandIds.length ? brandIds : fallback);

  const storeIds = (stores ?? []).map((s) => s.id);
  const storeFallback = storeIds.length ? storeIds : fallback;

  const { data: ordersInPeriod } = await supabase
    .from("orders")
    .select("id, status, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());

  interface OrderWithItems {
    id: string;
    status: string;
    ordered_at: string;
    order_items: { original_name: string; quantity: number; total_price: number; is_addon: boolean }[];
  }

  const orderItemsFlat: ProductOrderItemInput[] = ((ordersInPeriod ?? []) as unknown as OrderWithItems[]).flatMap(
    (order) =>
      order.order_items.map((item) => ({
        original_name: item.original_name,
        quantity: item.quantity,
        total_price: item.total_price,
        is_addon: item.is_addon,
        order_status: order.status,
        ordered_at: order.ordered_at,
      }))
  );

  const { data: detailedOrdersRaw } = await supabase
    .from("orders")
    .select(
      "id, ordered_at, gross_amount, payment_method, status, customers(full_name, phone_masked), order_items(original_name, quantity, is_addon)"
    )
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString())
    .order("ordered_at", { ascending: false })
    .limit(100);

  interface DetailedOrderRow {
    id: string;
    ordered_at: string;
    gross_amount: number;
    payment_method: string | null;
    status: string;
    customers: { full_name: string | null; phone_masked: string | null } | null;
    order_items: { original_name: string; quantity: number; is_addon: boolean }[];
  }

  const detailedOrders = (detailedOrdersRaw ?? []) as unknown as DetailedOrderRow[];

  const rankingRows = buildProductRanking(orderItemsFlat);
  const topByQuantity = rankByQuantity(rankingRows).slice(0, 15);
  const topByRevenue = rankByRevenue(rankingRows).slice(0, 15);
  const catalogNames = (products ?? []).map((p) => p.canonical_name);
  const withoutSalesNames = new Set(findProductsWithoutSales(catalogNames, rankingRows));
  // Nomes podem se repetir entre marcas diferentes (ex.: "Coca-Cola" na Gulas
  // e na Kings Chicken) — usamos o id do produto pra manter cada card
  // distinto em vez de deduplicar pelo nome.
  const withoutSales = (products ?? []).filter((p) => withoutSalesNames.has(p.canonical_name));
  const now = new Date().toISOString();

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Ranking calculado a partir dos itens de pedidos concluídos (agrupados pelo
            nome original, antes de qualquer correspondência entre plataformas).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))} current={selectedBrandId} />
          <CategorySelect
            categories={(categories ?? []).map((c) => ({ id: c.id, name: c.canonical_name }))}
            current={validSelectedCategoryId}
          />
          <PeriodSelect current={preset} />
          <DateRangePicker from={customFrom} to={customTo} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mais vendidos (quantidade)</CardTitle>
            <CardDescription>Pedidos concluídos no período, sem contar adicionais.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topByQuantity.map((row, index) => (
                  <TableRow key={`${index}-${row.name}`}>
                    <TableCell className="max-w-[200px] truncate">{row.name}</TableCell>
                    <TableCell className="text-right">{row.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                  </TableRow>
                ))}
                {topByQuantity.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      Nenhuma venda concluída no período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mais vendidos (faturamento)</CardTitle>
            <CardDescription>Pedidos concluídos no período.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topByRevenue.map((row, index) => (
                  <TableRow key={`${index}-${row.name}`}>
                    <TableCell className="max-w-[200px] truncate">{row.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell className="text-right">{row.quantity}</TableCell>
                  </TableRow>
                ))}
                {topByRevenue.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      Nenhuma venda concluída no período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dias desde a última venda</CardTitle>
          <CardDescription>
            Só considera produtos que venderam pelo menos uma vez no período selecionado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {rankingRows
              .slice()
              .sort((a, b) => a.lastSoldAt.localeCompare(b.lastSoldAt))
              .slice(0, 20)
              .map((row) => {
                const days = daysSinceLastSale(row.lastSoldAt, now);
                return (
                  <Badge key={row.name} variant={days > 7 ? "destructive" : "outline"}>
                    {row.name}: {days === 0 ? "hoje" : `${days}d`}
                  </Badge>
                );
              })}
            {rankingRows.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos do período</CardTitle>
          <CardDescription>
            Até 100 pedidos mais recentes no escopo selecionado. Telefone sempre
            mascarado (LGPD) — ver SECURITY.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Produto(s)</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailedOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(order.ordered_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {order.customers?.full_name ?? "Não identificado"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {order.customers?.phone_masked ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs">
                    {order.order_items.length > 0
                      ? order.order_items
                          .filter((i) => !i.is_addon)
                          .map((i) => `${i.quantity}x ${i.original_name}`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{order.payment_method ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(order.gross_amount)}</TableCell>
                </TableRow>
              ))}
              {detailedOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Nenhum pedido no período selecionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produtos do catálogo sem venda no período</CardTitle>
          <CardDescription>
            Não classifica automaticamente como &quot;produto ruim&quot; — só informa ausência de
            venda registrada. {withoutSales.length > 60 && "Use o filtro de marca/categoria acima para refinar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {withoutSales.slice(0, 60).map((product) => (
            <Badge key={product.id} variant="outline">
              {product.canonical_name}
            </Badge>
          ))}
          {withoutSales.length > 60 && (
            <Badge variant="secondary">+{withoutSales.length - 60} mais</Badge>
          )}
          {withoutSales.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {catalogNames.length === 0
                ? "Nenhum produto cadastrado no catálogo ainda."
                : "Todos os produtos cadastrados venderam no período."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo produto</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm brands={brands ?? []} categories={categories ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produtos cadastrados</CardTitle>
          <CardDescription>{(products ?? []).length} produto(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductsTable
            products={(products ?? []).map((p) => ({
              id: p.id,
              canonical_name: p.canonical_name,
              brandName: brandById.get(p.brand_id)?.name ?? "—",
              categoryName: p.category_id ? categoryById.get(p.category_id)?.canonical_name ?? "—" : "—",
              price: p.current_price,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
