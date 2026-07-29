import { ProductsViewerTab } from "@/components/viewer/products-viewer-tab";
import { BlockedNotice } from "./blocked-notice";

export default async function ProdutosVendidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const blocked = params.blocked === "1";

  return (
    <div className="space-y-3">
      {blocked && <BlockedNotice />}
      <ProductsViewerTab />
    </div>
  );
}
