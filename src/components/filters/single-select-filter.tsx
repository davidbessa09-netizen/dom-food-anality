"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FilterOption } from "@/lib/filters/types";

const ALL_VALUE = "__all__";

/**
 * Seletor único genérico ligado a um parâmetro de URL — substitui ter um
 * componente próprio por filtro (marca, canal, status, tipo de retirada,
 * comparação todos usam este mesmo componente, só muda `paramKey`/`options`).
 */
export function SingleSelectFilter({
  paramKey,
  options,
  current,
  allLabel,
  className,
  onNavigateStart,
}: {
  paramKey: string;
  options: FilterOption[];
  current: string | null;
  allLabel: string;
  className?: string;
  onNavigateStart?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const value = current ?? ALL_VALUE;

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams);
        if (!v || v === ALL_VALUE) params.delete(paramKey);
        else params.set(paramKey, v);
        onNavigateStart?.();
        startTransition(() => router.push(`?${params.toString()}`));
      }}
    >
      <SelectTrigger className={className ?? "w-44"}>
        <SelectValue>
          {() => (value === ALL_VALUE ? allLabel : options.find((o) => o.value === value)?.label ?? allLabel)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
