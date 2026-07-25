"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface CategoryRow {
  id: string;
  canonical_name: string;
}

interface BrandGroup {
  brandId: string;
  brandName: string;
  categories: CategoryRow[];
}

export function CategoriesList({ groups }: { groups: BrandGroup[] }) {
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups
      .map((g) => ({
        ...g,
        categories: g.categories.filter(
          (c) => c.canonical_name.toLowerCase().includes(term) || g.brandName.toLowerCase().includes(term)
        ),
      }))
      .filter((g) => g.categories.length > 0);
  }, [groups, search]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por categoria ou marca..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      {filteredGroups.map((group) => (
        <div key={group.brandId}>
          <p className="mb-2 font-medium">{group.brandName}</p>
          <div className="flex flex-wrap gap-2">
            {group.categories.map((c) => (
              <Badge key={c.id} variant="secondary">
                {c.canonical_name}
              </Badge>
            ))}
          </div>
        </div>
      ))}
      {filteredGroups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {groups.length === 0 ? "Nenhuma categoria cadastrada ainda." : "Nenhuma categoria encontrada para essa busca."}
        </p>
      )}
    </div>
  );
}
