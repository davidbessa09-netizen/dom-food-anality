"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { FilterOption } from "@/lib/filters/types";
import { ChevronDown } from "lucide-react";

/**
 * Multi-select com busca ligado a um parâmetro de URL (valores separados por
 * vírgula). Só escreve na URL quando o popover fecha — evita uma navegação
 * por clique de checkbox quando o usuário marca várias opções em sequência.
 */
export function MultiSelectFilter({
  paramKey,
  options,
  selected,
  placeholder,
  searchPlaceholder = "Buscar...",
  onNavigateStart,
}: {
  paramKey: string;
  options: FilterOption[];
  selected: string[];
  placeholder: string;
  searchPlaceholder?: string;
  onNavigateStart?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term));
  }, [options, search]);

  function commit(next: string[]) {
    const params = new URLSearchParams(searchParams);
    if (next.length === 0) params.delete(paramKey);
    else params.set(paramKey, next.join(","));
    onNavigateStart?.();
    startTransition(() => router.push(`?${params.toString()}`));
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next && JSON.stringify(draft) !== JSON.stringify(selected)) {
          commit(draft);
        }
        setOpen(next);
        if (next) setDraft(selected);
      }}
    >
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        {selected.length === 0 ? placeholder : `${placeholder} (${selected.length})`}
        <ChevronDown className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {filteredOptions.map((option) => {
            const checked = draft.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    setDraft((prev) =>
                      next ? [...prev, option.value] : prev.filter((v) => v !== option.value)
                    );
                  }}
                />
                <span className="truncate">{option.label}</span>
              </label>
            );
          })}
          {filteredOptions.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nada encontrado.</p>
          )}
        </div>
        {draft.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setDraft([])}>
            Limpar seleção
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
