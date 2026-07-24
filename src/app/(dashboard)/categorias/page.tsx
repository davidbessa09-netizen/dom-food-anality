import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { CategoryForm } from "./category-form";
import type { Brand, Category } from "@/types/database";

export default async function CategoriesPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const orgIds = [...new Set((user?.memberships ?? []).map((m) => m.organization_id))];

  const { data: brands } = await supabase
    .from("brands")
    .select("*")
    .in("organization_id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"])
    .returns<Brand[]>();

  const brandIds = (brands ?? []).map((b) => b.id);

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .in("brand_id", brandIds.length ? brandIds : ["00000000-0000-0000-0000-000000000000"])
    .order("canonical_name")
    .returns<Category[]>();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
        <p className="text-sm text-muted-foreground">
          Categorias do cardápio, por marca. Usadas para agrupar produtos e analisar
          desempenho por categoria (Fase 4).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryForm brands={brands ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias cadastradas</CardTitle>
          <CardDescription>{(categories ?? []).length} categoria(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(brands ?? []).map((brand) => {
            const brandCategories = (categories ?? []).filter((c) => c.brand_id === brand.id);
            if (brandCategories.length === 0) return null;
            return (
              <div key={brand.id}>
                <p className="mb-2 font-medium">{brand.name}</p>
                <div className="flex flex-wrap gap-2">
                  {brandCategories.map((c) => (
                    <Badge key={c.id} variant="secondary">
                      {c.canonical_name}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
          {(categories ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
