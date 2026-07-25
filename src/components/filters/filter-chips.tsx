"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface ActiveChip {
  /** Chave do parâmetro de URL (ou "key:value" para itens de um multi-select). */
  paramKey: string;
  /** Valor exato a remover — undefined remove o parâmetro inteiro. */
  removeValue?: string;
  label: string;
}

/** Parâmetros que nunca viram chip (fazem parte da navegação, não são "filtro"). */
const NON_FILTER_PARAMS = new Set(["page"]);

export function FilterChips({
  chips,
  onNavigateStart,
}: {
  chips: ActiveChip[];
  onNavigateStart?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function removeChip(chip: ActiveChip) {
    const params = new URLSearchParams(searchParams);
    if (chip.removeValue) {
      const current = params.get(chip.paramKey);
      const rest = (current ?? "")
        .split(",")
        .filter((v) => v && v !== chip.removeValue);
      if (rest.length > 0) params.set(chip.paramKey, rest.join(","));
      else params.delete(chip.paramKey);
    } else {
      params.delete(chip.paramKey);
    }
    onNavigateStart?.();
    startTransition(() => router.push(`?${params.toString()}`));
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams);
    for (const key of Array.from(params.keys())) {
      if (!NON_FILTER_PARAMS.has(key)) params.delete(key);
    }
    onNavigateStart?.();
    startTransition(() => router.push(`?${params.toString()}`));
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">
        {chips.length} filtro{chips.length > 1 ? "s" : ""} ativo{chips.length > 1 ? "s" : ""}
      </span>
      {chips.map((chip) => (
        <Badge key={`${chip.paramKey}-${chip.removeValue ?? "all"}-${chip.label}`} variant="secondary" className="gap-1 pr-1">
          {chip.label}
          <button
            type="button"
            onClick={() => removeChip(chip)}
            aria-label={`Remover filtro ${chip.label}`}
            className="rounded-sm hover:bg-foreground/10"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" onClick={clearAll}>
        Limpar filtros
      </Button>
    </div>
  );
}
