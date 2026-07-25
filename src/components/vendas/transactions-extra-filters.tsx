"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SingleSelectFilter } from "@/components/filters/single-select-filter";
import type { FilterOption } from "@/lib/filters/types";

/**
 * Filtros específicos da aba Transações (pagamento, bairro, faixa de valor,
 * busca) — não entram no GlobalFilterBar porque só fazem sentido aqui, ver
 * critério de "filtro contextual por tela" do sistema de filtros global.
 * Texto/número só navega no Enter/blur, pra não disparar 1 fetch por tecla.
 */
export function TransactionsExtraFilters({
  paymentOptions,
  neighborhoodOptions,
  currentPayment,
  currentNeighborhood,
  currentMin,
  currentMax,
  currentSearch,
}: {
  paymentOptions: FilterOption[];
  neighborhoodOptions: FilterOption[];
  currentPayment: string | null;
  currentNeighborhood: string | null;
  currentMin?: string;
  currentMax?: string;
  currentSearch?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch ?? "");
  const [min, setMin] = useState(currentMin ?? "");
  const [max, setMax] = useState(currentMax ?? "");

  function commit(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Buscar por cliente..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onBlur={() => commit({ q: search })}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit({ q: search });
        }}
        className="w-48"
      />
      <SingleSelectFilter
        paramKey="payment"
        options={paymentOptions}
        current={currentPayment}
        allLabel="Todos os pagamentos"
        className="w-48"
      />
      <SingleSelectFilter
        paramKey="neighborhood"
        options={neighborhoodOptions}
        current={currentNeighborhood}
        allLabel="Todos os bairros"
        className="w-44"
      />
      <div className="flex items-center gap-1">
        <Input
          placeholder="Mín. R$"
          inputMode="decimal"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => commit({ minValue: min })}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit({ minValue: min });
          }}
          className="w-24"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          placeholder="Máx. R$"
          inputMode="decimal"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => commit({ maxValue: max })}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit({ maxValue: max });
          }}
          className="w-24"
        />
      </div>
    </div>
  );
}
