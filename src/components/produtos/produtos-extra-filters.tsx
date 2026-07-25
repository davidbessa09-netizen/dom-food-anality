"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SingleSelectFilter } from "@/components/filters/single-select-filter";

const HAS_SALES_OPTIONS = [
  { value: "com", label: "Com venda no período" },
  { value: "sem", label: "Sem venda no período" },
];
const HAS_PRICE_OPTIONS = [
  { value: "com", label: "Com preço cadastrado" },
  { value: "sem", label: "Sem preço cadastrado" },
];
const ACTIVE_OPTIONS = [
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" },
];
const ITEM_TYPE_OPTIONS = [
  { value: "principal", label: "Só produto principal" },
  { value: "adicional", label: "Só adicional" },
  { value: "all", label: "Principal + adicional" },
];

/**
 * Filtros específicos de /produtos (busca, faixa de preço, com/sem venda,
 * com/sem preço, ativo/inativo, adicional vs. principal) — não entram no
 * GlobalFilterBar por serem contextuais desta tela.
 */
export function ProdutosExtraFilters({
  currentSearch,
  currentMinPrice,
  currentMaxPrice,
  currentHasSales,
  currentHasPrice,
  currentActive,
  currentItemType,
}: {
  currentSearch?: string;
  currentMinPrice?: string;
  currentMaxPrice?: string;
  currentHasSales: string | null;
  currentHasPrice: string | null;
  currentActive: string | null;
  currentItemType: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch ?? "");
  const [minPrice, setMinPrice] = useState(currentMinPrice ?? "");
  const [maxPrice, setMaxPrice] = useState(currentMaxPrice ?? "");

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
        placeholder="Buscar produto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onBlur={() => commit({ q: search })}
        onKeyDown={(e) => e.key === "Enter" && commit({ q: search })}
        className="w-48"
      />
      <div className="flex items-center gap-1">
        <Input
          placeholder="Mín. R$"
          inputMode="decimal"
          value={minPrice}
          onChange={(e) => setMinPrice(e.target.value)}
          onBlur={() => commit({ minPrice })}
          onKeyDown={(e) => e.key === "Enter" && commit({ minPrice })}
          className="w-24"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          placeholder="Máx. R$"
          inputMode="decimal"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          onBlur={() => commit({ maxPrice })}
          onKeyDown={(e) => e.key === "Enter" && commit({ maxPrice })}
          className="w-24"
        />
      </div>
      <SingleSelectFilter paramKey="hasSales" options={HAS_SALES_OPTIONS} current={currentHasSales} allLabel="Com/sem venda" className="w-44" />
      <SingleSelectFilter paramKey="hasPrice" options={HAS_PRICE_OPTIONS} current={currentHasPrice} allLabel="Com/sem preço" className="w-44" />
      <SingleSelectFilter paramKey="active" options={ACTIVE_OPTIONS} current={currentActive} allLabel="Ativos e inativos" className="w-44" />
      <SingleSelectFilter paramKey="itemType" options={ITEM_TYPE_OPTIONS} current={currentItemType} allLabel="Só produto principal" className="w-52" />
    </div>
  );
}
