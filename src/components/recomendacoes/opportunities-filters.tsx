"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SingleSelectFilter } from "@/components/filters/single-select-filter";
import { CATEGORY_LABELS, STATUS_LABELS, ORIGIN_LABELS } from "./opportunity-types";

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));
const ORIGIN_OPTIONS = Object.entries(ORIGIN_LABELS).map(([value, label]) => ({ value, label }));
const SORT_OPTIONS = [
  { value: "score", label: "Score (maior primeiro)" },
  { value: "priority", label: "Prioridade" },
  { value: "recent", label: "Mais recente" },
];

export function OpportunitiesFilters({
  currentSearch,
  currentCategory,
  currentBrandId,
  currentStatus,
  currentOrigin,
  currentSort,
  brands,
}: {
  currentSearch?: string;
  currentCategory: string | null;
  currentBrandId: string | null;
  currentStatus: string | null;
  currentOrigin: string | null;
  currentSort: string;
  brands: { value: string; label: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch ?? "");

  function commit(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Buscar por palavra-chave..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onBlur={() => commit({ q: search })}
        onKeyDown={(e) => e.key === "Enter" && commit({ q: search })}
        className="w-56"
      />
      <SingleSelectFilter paramKey="category" options={CATEGORY_OPTIONS} current={currentCategory} allLabel="Todas as categorias" className="w-48" />
      <SingleSelectFilter paramKey="brand" options={brands} current={currentBrandId} allLabel="Todas as marcas" className="w-44" />
      <SingleSelectFilter paramKey="status" options={STATUS_OPTIONS} current={currentStatus} allLabel="Todos os status" className="w-44" />
      <SingleSelectFilter paramKey="origin" options={ORIGIN_OPTIONS} current={currentOrigin} allLabel="Todas as origens" className="w-52" />
      <SingleSelectFilter paramKey="sort" options={SORT_OPTIONS} current={currentSort === "score" ? null : currentSort} allLabel="Score (maior primeiro)" className="w-52" />
    </div>
  );
}
