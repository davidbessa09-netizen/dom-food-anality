import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { GlobalFilterBar } from "@/components/filters/global-filter-bar";
import { parseFilters } from "@/lib/filters/parse";
import { PageTabs } from "@/components/vendas/page-tabs";
import { ProdutosExtraFilters } from "@/components/produtos/produtos-extra-filters";
import { CatalogTable, type CatalogRow } from "@/components/produtos/catalog-table";
import { AbcCurveChart } from "@/components/produtos/abc-curve-chart";
import { ShareBars } from "@/components/vendas/share-bars";
import { SalesBarChart } from "@/components/charts/sales-bar-chart";
import { VariantsTabContent } from "@/components/produtos/variants-tab-content";
import {
  buildProductRanking,
  daysSinceLastSale,
  findProductsWithoutSales,
  rankByQuantity,
  rankByRevenue,
  averageItemsPerOrder,
  type ProductOrderItemInput,
  type RankingItemType,
} from "@/lib/metrics/products";
import { buildAbcCurve, topNConcentration } from "@/lib/metrics/abc-curve";
import { classifyLowPerformers, type AllTimeSalesInfo } from "@/lib/metrics/product-performance";
import { findDuplicateProducts } from "@/lib/metrics/data-quality";
import { salesByDay } from "@/lib/metrics/sales-timeseries";
import type { Brand, Category, Product } from "@/types/database";
import type { LowPerformerRow } from "@/lib/metrics/product-performance";

const MIN_SAMPLE_DAYS = 14;
const LOW_QUANTITY_THRESHOLD = 3;
const STALE_DAYS_THRESHOLD = 30;

const TABS = [
  { value: "visao-geral", label: "Visão geral" },
  { value: "mais-vendidos", label: "Mais vendidos" },
  { value: "baixa-saida", label: "Baixa saída" },
  { value: "sem-vendas", label: "Sem vendas" },
  { value: "catalogo", label: "Catálogo" },
  { value: "variacoes", label: "Variações/correspondências" },
];

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

interface OrderWithItems {
  status: string;
  gross_amount: number;
  ordered_at: string;
  order_items: { original_name: string; quantity: number; total_price: number; is_addon: boolean }[];
}

function flattenItems(rows: OrderWithItems[]): ProductOrderItemInput[] {
  return rows.flatMap((order) =>
    order.order_items.map((item) => ({
      original_name: item.original_name,
      quantity: item.quantity,
      total_price: item.total_price,
      is_addon: item.is_addon,
      order_status: order.status,
      ordered_at: order.ordered_at,
    }))
  );
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const { period, periodPreset: preset, customFrom, customTo } = filters;
  const selectedBrandId = filters.brandId;
  const selectedCategoryId = filters.category;
  const tab = TABS.some((t) => t.value === params.tab) ? (params.tab as string) : "visao-geral";
  const itemType: RankingItemType =
    typeof params.itemType === "string" && (params.itemType === "adicional" || params.itemType === "all")
      ? params.itemType
      : "principal";
  const search = typeof params.q === "string" ? params.q : undefined;
  const minPrice = typeof params.minPrice === "string" ? params.minPrice : undefined;
  const maxPrice = typeof params.maxPrice === "string" ? params.maxPrice : undefined;
  const hasSales = typeof params.hasSales === "string" ? params.hasSales : null;
  const hasPrice = typeof params.hasPrice === "string" ? params.hasPrice : null;
  const active = typeof params.active === "string" ? params.active : null;

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
  if (validSelectedCategoryId) productsQuery = productsQuery.eq("category_id", validSelectedCategoryId);
  if (active === "ativo") productsQuery = productsQuery.eq("is_active", true);
  if (active === "inativo") productsQuery = productsQuery.eq("is_active", false);
  if (minPrice) productsQuery = productsQuery.gte("current_price", Number(minPrice));
  if (maxPrice) productsQuery = productsQuery.lte("current_price", Number(maxPrice));
  if (hasPrice === "com") productsQuery = productsQuery.not("current_price", "is", null);
  if (hasPrice === "sem") productsQuery = productsQuery.is("current_price", null);
  if (search) productsQuery = productsQuery.ilike("canonical_name", `%${search}%`);
  const { data: products } = await productsQuery.returns<Product[]>();

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .in("brand_id", brandIds.length ? brandIds : fallback);

  const allStoreIds = (stores ?? []).map((s) => s.id);
  const selectedStoreIds = filters.storeIds.filter((id) => allStoreIds.includes(id));
  const scopedStoreIds = selectedStoreIds.length > 0 ? selectedStoreIds : allStoreIds;
  const storeFallback = scopedStoreIds.length ? scopedStoreIds : fallback;

  let ordersInPeriodQuery = supabase
    .from("orders")
    .select("id, status, gross_amount, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
    .in("store_id", storeFallback)
    .gte("ordered_at", period.start.toISOString())
    .lte("ordered_at", period.end.toISOString());
  if (filters.channel) ordersInPeriodQuery = ordersInPeriodQuery.eq("source_platform", filters.channel);
  if (filters.fulfillment) ordersInPeriodQuery = ordersInPeriodQuery.eq("fulfillment_type", filters.fulfillment);
  const { data: ordersInPeriod } = await ordersInPeriodQuery;

  const ordersInPeriodTyped = (ordersInPeriod ?? []) as unknown as OrderWithItems[];
  const orderItemsFlat = flattenItems(ordersInPeriodTyped);
  const rankingRows = buildProductRanking(orderItemsFlat, itemType);

  const catalogNames = (products ?? []).map((p) => p.canonical_name);
  const soldNamesInPeriod = new Set(rankingRows.map((r) => r.name));
  const productsForCatalog = (products ?? []).filter((p) => {
    if (hasSales === "com") return soldNamesInPeriod.has(p.canonical_name);
    if (hasSales === "sem") return !soldNamesInPeriod.has(p.canonical_name);
    return true;
  });

  const brandById = new Map((brands ?? []).map((b) => [b.id, b]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));

  function buildHref(nextTab: string) {
    const usp = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))
    );
    usp.set("tab", nextTab);
    return `?${usp.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Ranking calculado a partir dos itens de pedidos concluídos (agrupados pelo nome
            original). Catálogo e correspondências ficam em abas próprias.
          </p>
        </div>
        <PageTabs tabs={TABS} current={tab} buildHref={buildHref} />
      </div>

      <div className="space-y-2">
        <GlobalFilterBar
          fields={["brand", "stores", "channel", "category", "period", "fulfillment"]}
          brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))}
          stores={(stores ?? []).map((s) => ({ id: s.id, name: s.name }))}
          categories={(categories ?? []).map((c) => ({ id: c.id, name: c.canonical_name }))}
          currentBrandId={selectedBrandId}
          currentStoreIds={selectedStoreIds}
          currentChannel={filters.channel}
          currentPeriodPreset={preset}
          currentFrom={customFrom}
          currentTo={customTo}
          currentFulfillment={filters.fulfillment}
          currentCategoryId={validSelectedCategoryId}
        />
        <ProdutosExtraFilters
          currentSearch={search}
          currentMinPrice={minPrice}
          currentMaxPrice={maxPrice}
          currentHasSales={hasSales}
          currentHasPrice={hasPrice}
          currentActive={active}
          currentItemType={itemType === "principal" ? null : itemType}
        />
      </div>

      {tab === "visao-geral" && (
        <OverviewTab
          rankingRows={rankingRows}
          products={products ?? []}
          categoryById={categoryById}
          ordersInPeriodTyped={ordersInPeriodTyped}
        />
      )}

      {tab === "mais-vendidos" && <TopSellersTab rankingRows={rankingRows} />}

      {tab === "sem-vendas" && (
        <NoSalesTab
          products={products ?? []}
          rankingRows={rankingRows}
          brandById={brandById}
          categoryById={categoryById}
          catalogNames={catalogNames}
        />
      )}

      {tab === "baixa-saida" && (
        <LowPerformersTab
          storeFallback={storeFallback}
          products={products ?? []}
          rankingRows={rankingRows}
          itemType={itemType}
          supabase={supabase}
        />
      )}

      {tab === "catalogo" && (
        <CatalogTabContent
          productsForCatalog={productsForCatalog}
          products={products ?? []}
          brands={brands ?? []}
          categories={categories ?? []}
          brandById={brandById}
          categoryById={categoryById}
          supabase={supabase}
        />
      )}

      {tab === "variacoes" && <VariantsTabContent brandIds={brandIds} />}
    </div>
  );
}

async function OverviewTab({
  rankingRows,
  products,
  categoryById,
  ordersInPeriodTyped,
}: {
  rankingRows: ReturnType<typeof buildProductRanking>;
  products: Product[];
  categoryById: Map<string, Category>;
  ordersInPeriodTyped: OrderWithItems[];
}) {
  const totalRevenue = rankingRows.reduce((sum, r) => sum + r.revenue, 0);
  const totalQuantity = rankingRows.reduce((sum, r) => sum + r.quantity, 0);

  const abcRows = buildAbcCurve(rankingRows.map((r) => ({ name: r.name, revenue: r.revenue, quantity: r.quantity })));
  const countA = abcRows.filter((r) => r.classification === "A").length;
  const countB = abcRows.filter((r) => r.classification === "B").length;
  const countC = abcRows.filter((r) => r.classification === "C").length;
  const concentrationTop10 = topNConcentration(
    rankingRows.map((r) => ({ name: r.name, revenue: r.revenue, quantity: r.quantity })),
    10
  );

  const itemsPerOrder = averageItemsPerOrder(
    ordersInPeriodTyped.map((o) => ({ status: o.status, items: o.order_items }))
  );

  // Receita por categoria: cada item vendido é correspondido ao produto do
  // catálogo pelo nome (mesmo critério simplificado usado no resto do
  // sistema — nome original == nome canônico); itens ainda sem
  // correspondência confirmada em "Variações" caem em "Sem categoria".
  const categoryNameByProductName = new Map<string, string>();
  for (const p of products) {
    categoryNameByProductName.set(p.canonical_name, p.category_id ? categoryById.get(p.category_id)?.canonical_name ?? "Sem categoria" : "Sem categoria");
  }
  const revenueByCategory = new Map<string, number>();
  for (const row of rankingRows) {
    const categoryName = categoryNameByProductName.get(row.name) ?? "Sem categoria";
    revenueByCategory.set(categoryName, (revenueByCategory.get(categoryName) ?? 0) + row.revenue);
  }
  const categoryRows = Array.from(revenueByCategory.entries())
    .map(([name, revenue]) => ({ key: name, label: name, revenue, share: totalRevenue > 0 ? revenue / totalRevenue : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const byDay = salesByDay(ordersInPeriodTyped).map((r) => ({
    label: new Date(`${r.date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    revenue: r.revenue,
    orders: r.orders,
  }));

  const top10 = rankByRevenue(rankingRows).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Quantidade vendida</CardDescription>
            <CardTitle className="text-2xl">{totalQuantity}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faturamento de produtos</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(totalRevenue)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Itens por pedido</CardDescription>
            <CardTitle className="text-2xl">{itemsPerOrder === null ? "—" : itemsPerOrder.toFixed(1)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Só itens principais, pedidos concluídos</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Concentração no top 10</CardDescription>
            <CardTitle className="text-2xl">{formatPercent(concentrationTop10)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {concentrationTop10 === null ? "Sem faturamento no período" : "Do faturamento vem dos 10 produtos mais vendidos"}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendência de faturamento</CardTitle>
          <CardDescription>Faturamento bruto diário no escopo e período selecionados.</CardDescription>
        </CardHeader>
        <CardContent>
          {byDay.length > 0 ? <SalesBarChart data={byDay} /> : <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receita por categoria</CardTitle>
          <CardDescription>
            Correspondência por nome do produto — itens ainda sem vínculo confirmado em
            &quot;Variações/correspondências&quot; aparecem em &quot;Sem categoria&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShareBars rows={categoryRows} emptyLabel="Sem dados no período." />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Curva ABC</CardTitle>
            <CardDescription>
              A: {countA} produto(s) · B: {countB} · C: {countC} — corte em 80%/95% do faturamento acumulado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {abcRows.length > 0 ? <AbcCurveChart rows={abcRows} /> : <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Participação no faturamento (top 10)</CardTitle>
            <CardDescription>Faturamento e participação de cada produto no total do período.</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareBars
              rows={top10.map((r) => ({ key: r.name, label: r.name, revenue: r.revenue, share: totalRevenue > 0 ? r.revenue / totalRevenue : 0 }))}
              emptyLabel="Sem dados no período."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function TopSellersTab({ rankingRows }: { rankingRows: ReturnType<typeof buildProductRanking> }) {
  const topByQuantity = rankByQuantity(rankingRows).slice(0, 15);
  const topByRevenue = rankByRevenue(rankingRows).slice(0, 15);
  const now = new Date().toISOString();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mais vendidos (quantidade)</CardTitle>
            <CardDescription>Pedidos concluídos no período.</CardDescription>
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
          <CardDescription>Só considera produtos que venderam pelo menos uma vez no período selecionado.</CardDescription>
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
            {rankingRows.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function NoSalesTab({
  products,
  rankingRows,
  brandById,
  categoryById,
  catalogNames,
}: {
  products: Product[];
  rankingRows: ReturnType<typeof buildProductRanking>;
  brandById: Map<string, Brand>;
  categoryById: Map<string, Category>;
  catalogNames: string[];
}) {
  const withoutSalesNames = new Set(findProductsWithoutSales(catalogNames, rankingRows));
  const withoutSales = products.filter((p) => withoutSalesNames.has(p.canonical_name));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Produtos do catálogo sem venda no período</CardTitle>
        <CardDescription>
          Não classifica automaticamente como &quot;produto ruim&quot; — só informa ausência de venda
          registrada NESTE período. Para uma análise que considera todo o histórico, veja a aba
          Baixa saída.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Preço</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withoutSales.slice(0, 200).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-[240px] truncate font-medium">{p.canonical_name}</TableCell>
                <TableCell>{brandById.get(p.brand_id)?.name ?? "—"}</TableCell>
                <TableCell>{p.category_id ? categoryById.get(p.category_id)?.canonical_name ?? "—" : "—"}</TableCell>
                <TableCell className="text-right">{formatCurrency(p.current_price)}</TableCell>
              </TableRow>
            ))}
            {withoutSales.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  {catalogNames.length === 0 ? "Nenhum produto cadastrado no catálogo ainda." : "Todos os produtos cadastrados venderam no período."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {withoutSales.length > 200 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Mostrando 200 de {withoutSales.length}. Use os filtros de marca/categoria/busca acima para refinar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

async function LowPerformersTab({
  storeFallback,
  products,
  rankingRows,
  itemType,
  supabase,
}: {
  storeFallback: string[];
  products: Product[];
  rankingRows: ReturnType<typeof buildProductRanking>;
  itemType: RankingItemType;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: allTimeOrdersRaw } = await supabase
    .from("orders")
    .select("status, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
    .in("store_id", storeFallback);

  const allTimeItems = flattenItems((allTimeOrdersRaw ?? []) as unknown as OrderWithItems[]);
  const allTimeRankingRows = buildProductRanking(allTimeItems, itemType);
  const allTimeAllRankingRows = buildProductRanking(allTimeItems, "all");
  const allTimePrincipalNames = new Set(buildProductRanking(allTimeItems, "principal").map((r) => r.name));
  const addonOnlyNames = new Set(allTimeAllRankingRows.map((r) => r.name).filter((name) => !allTimePrincipalNames.has(name)));

  const allTimeSalesByName = new Map<string, AllTimeSalesInfo>(
    allTimeRankingRows.map((r) => [r.name, { name: r.name, lastSoldAt: r.lastSoldAt, totalQuantity: r.quantity }])
  );
  const periodQuantityByName = new Map(rankingRows.map((r) => [r.name, r.quantity]));
  const duplicateNames = new Set(findDuplicateProducts(products).flatMap((g) => [g.name]));

  const result = classifyLowPerformers({
    products: products.map((p) => ({ id: p.id, canonical_name: p.canonical_name, is_active: p.is_active, created_at: p.created_at })),
    periodQuantityByName,
    allTimeSalesByName,
    addonOnlyNames,
    duplicateNames,
    now: new Date().toISOString(),
    minSampleDays: MIN_SAMPLE_DAYS,
    lowQuantityThreshold: LOW_QUANTITY_THRESHOLD,
    staleDaysThreshold: STALE_DAYS_THRESHOLD,
  });

  const neverSold = result.rows.filter((r) => r.reason === "nunca_vendeu");
  const stale = result.rows.filter((r) => r.reason === "sem_venda_recente");
  const lowVolume = result.rows.filter((r) => r.reason === "vendeu_pouco");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Considera TODO o histórico sincronizado (não só o período do filtro) pra separar
        &quot;nunca vendeu&quot; de &quot;parou de vender&quot;. Exige pelo menos {MIN_SAMPLE_DAYS} dias de
        cadastro antes de classificar (amostra mínima) — {result.insufficientSample.length} produto(s)
        recém-cadastrado(s) ainda não entram nessa análise. {result.excluded.length} produto(s)
        excluído(s) por serem inativos, adicionais ou duplicados (não competem aqui).
      </p>
      <LowPerformerSection
        title="Nunca vendeu"
        description="Nenhum registro de venda em todo o histórico sincronizado."
        rows={neverSold}
      />
      <LowPerformerSection
        title="Não vende há muito tempo"
        description={`Já vendeu, mas a última venda foi há mais de ${STALE_DAYS_THRESHOLD} dias.`}
        rows={stale}
      />
      <LowPerformerSection
        title="Vendeu pouco"
        description={`Vendeu recentemente, mas com quantidade baixa (≤ ${LOW_QUANTITY_THRESHOLD} un.) no período selecionado.`}
        rows={lowVolume}
      />
    </div>
  );
}

async function CatalogTabContent({
  productsForCatalog,
  products,
  brands,
  categories,
  brandById,
  categoryById,
  supabase,
}: {
  productsForCatalog: Product[];
  products: Product[];
  brands: Brand[];
  categories: Category[];
  brandById: Map<string, Brand>;
  categoryById: Map<string, Category>;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const productIds = products.map((p) => p.id);
  const fallback = ["00000000-0000-0000-0000-000000000000"];

  const { data: allTimeOrdersRaw } = await supabase
    .from("orders")
    .select("status, ordered_at, order_items(original_name, quantity, total_price, is_addon)")
    .limit(20000);

  const allTimeRanking = buildProductRanking(flattenItems((allTimeOrdersRaw ?? []) as unknown as OrderWithItems[]), "all");
  const lastSoldByName = new Map(allTimeRanking.map((r) => [r.name, r.lastSoldAt]));

  interface VariantJoinRow {
    product_id: string | null;
    sales_channels: { platform: string } | { platform: string }[] | null;
  }

  const { data: variantsRaw } = await supabase
    .from("product_variants")
    .select("product_id, sales_channels(platform)")
    .in("product_id", productIds.length ? productIds : fallback)
    .returns<VariantJoinRow[]>();

  const channelsByProduct = new Map<string, Set<string>>();
  for (const v of variantsRaw ?? []) {
    if (!v.product_id) continue;
    const channel = Array.isArray(v.sales_channels) ? v.sales_channels[0] : v.sales_channels;
    if (!channel) continue;
    const set = channelsByProduct.get(v.product_id) ?? new Set<string>();
    set.add(channel.platform);
    channelsByProduct.set(v.product_id, set);
  }

  const rows: CatalogRow[] = productsForCatalog.map((p) => {
    const channels = [...(channelsByProduct.get(p.id) ?? [])];
    return {
      id: p.id,
      brandId: p.brand_id,
      categoryId: p.category_id,
      canonicalName: p.canonical_name,
      brandName: brandById.get(p.brand_id)?.name ?? "—",
      categoryName: p.category_id ? categoryById.get(p.category_id)?.canonical_name ?? "—" : "—",
      price: p.current_price,
      isActive: p.is_active,
      origin: channels.length > 0 ? `Sincronizado (${channels.join(", ")})` : "Manual",
      channels,
      lastSoldAt: lastSoldByName.get(p.canonical_name) ?? null,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catálogo</CardTitle>
        <CardDescription>{rows.length} produto(s) no escopo e filtros selecionados.</CardDescription>
      </CardHeader>
      <CardContent>
        <CatalogTable products={rows} brands={brands} categories={categories} />
      </CardContent>
    </Card>
  );
}

function LowPerformerSection({ title, description, rows }: { title: string; description: string; rows: LowPerformerRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {title} ({rows.length})
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Qtd. no período</TableHead>
              <TableHead className="text-right">Dias sem venda</TableHead>
              <TableHead>Ação sugerida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 100).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-[200px] truncate font-medium">{row.name}</TableCell>
                <TableCell className="text-right">{row.periodQuantity}</TableCell>
                <TableCell className="text-right">{row.daysSinceLastSale ?? "—"}</TableCell>
                <TableCell className="max-w-xs text-xs text-muted-foreground">{row.suggestedAction}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Nenhum produto nessa categoria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
