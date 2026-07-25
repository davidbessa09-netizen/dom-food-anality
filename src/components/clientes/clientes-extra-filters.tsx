"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { SingleSelectFilter } from "@/components/filters/single-select-filter";
import type { RfmSegment } from "@/lib/metrics/rfm";

const SEGMENT_OPTIONS: { value: RfmSegment; label: string }[] = [
  { value: "Novos", label: "Novos" },
  { value: "Clientes fiéis", label: "Clientes fiéis" },
  { value: "Clientes de alto valor", label: "Clientes de alto valor" },
  { value: "Em crescimento", label: "Em crescimento" },
  { value: "Em risco", label: "Em risco" },
  { value: "Inativos", label: "Inativos" },
  { value: "Perdidos", label: "Perdidos" },
];

/** Filtros contextuais de /clientes (busca, segmento, recência, frequência,
 * valor) — não entram no GlobalFilterBar por serem específicos desta tela. */
export function ClientesExtraFilters({
  currentSearch,
  currentSegment,
  currentMinRecency,
  currentMaxRecency,
  currentMinFrequency,
  currentMaxFrequency,
  currentMinValue,
  currentMaxValue,
}: {
  currentSearch?: string;
  currentSegment: string | null;
  currentMinRecency?: string;
  currentMaxRecency?: string;
  currentMinFrequency?: string;
  currentMaxFrequency?: string;
  currentMinValue?: string;
  currentMaxValue?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch ?? "");
  const [minRecency, setMinRecency] = useState(currentMinRecency ?? "");
  const [maxRecency, setMaxRecency] = useState(currentMaxRecency ?? "");
  const [minFrequency, setMinFrequency] = useState(currentMinFrequency ?? "");
  const [maxFrequency, setMaxFrequency] = useState(currentMaxFrequency ?? "");
  const [minValue, setMinValue] = useState(currentMinValue ?? "");
  const [maxValue, setMaxValue] = useState(currentMaxValue ?? "");

  function commit(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.push(`?${params.toString()}`);
  }

  function rangeField(
    label: string,
    minVal: string,
    setMin: (v: string) => void,
    minKey: string,
    maxVal: string,
    setMax: (v: string) => void,
    maxKey: string
  ) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">{label}:</span>
        <Input
          placeholder="Mín."
          inputMode="numeric"
          value={minVal}
          onChange={(e) => setMin(e.target.value)}
          onBlur={() => commit({ [minKey]: minVal })}
          onKeyDown={(e) => e.key === "Enter" && commit({ [minKey]: minVal })}
          className="w-16"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          placeholder="Máx."
          inputMode="numeric"
          value={maxVal}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => commit({ [maxKey]: maxVal })}
          onKeyDown={(e) => e.key === "Enter" && commit({ [maxKey]: maxVal })}
          className="w-16"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder="Buscar por nome ou telefone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onBlur={() => commit({ q: search })}
        onKeyDown={(e) => e.key === "Enter" && commit({ q: search })}
        className="w-52"
      />
      <SingleSelectFilter paramKey="segment" options={SEGMENT_OPTIONS} current={currentSegment} allLabel="Todos os segmentos" className="w-52" />
      {rangeField("Recência (dias)", minRecency, setMinRecency, "minRecency", maxRecency, setMaxRecency, "maxRecency")}
      {rangeField("Frequência", minFrequency, setMinFrequency, "minFrequency", maxFrequency, setMaxFrequency, "maxFrequency")}
      {rangeField("Valor (R$)", minValue, setMinValue, "minValue", maxValue, setMaxValue, "maxValue")}
    </div>
  );
}
