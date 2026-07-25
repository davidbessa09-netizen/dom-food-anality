"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";

const MIN_COMPARE = 2;
const MAX_COMPARE = 5;

export interface StoreCompareOption {
  value: string;
  label: string;
}

/**
 * Seleção dedicada de 2 a 5 lojas pra comparação direta lado a lado — usa o
 * parâmetro `compareStores` na URL, separado do `stores` (que escopa a
 * página inteira). Bloqueia a 6ª seleção em vez de deixar o usuário
 * descobrir o limite só depois de tentar comparar.
 */
export function StoreCompareSelect({ options, selected }: { options: StoreCompareOption[]; selected: string[] }) {
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
    if (next.length < MIN_COMPARE) params.delete("compareStores");
    else params.set("compareStores", next.join(","));
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
        Comparar lojas {selected.length > 0 && `(${selected.length})`}
        <ChevronDown className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="mb-2 px-1 text-xs text-muted-foreground">
          Selecione de {MIN_COMPARE} a {MAX_COMPARE} lojas ({draft.length} selecionada(s)).
        </p>
        <Input placeholder="Buscar loja..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {filteredOptions.map((option) => {
            const checked = draft.includes(option.value);
            const disabled = !checked && draft.length >= MAX_COMPARE;
            return (
              <label
                key={option.value}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${
                  disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                }`}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(next) => {
                    setDraft((prev) => (next ? [...prev, option.value] : prev.filter((v) => v !== option.value)));
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
        {draft.length > 0 && draft.length < MIN_COMPARE && (
          <p className="mt-2 px-1 text-xs text-warning">Selecione pelo menos {MIN_COMPARE} lojas pra ver a comparação.</p>
        )}
        {draft.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setDraft([])}>
            Limpar seleção
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
