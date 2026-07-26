"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ProductAutocompleteOption {
  id: string;
  name: string;
}

/** Autocomplete simples de produto — busca no nome canônico já carregado
 * (sem round-trip extra), seleciona escrevendo o nome no parâmetro `product`
 * da URL (ver live-sales-tab.tsx). */
export function ProductAutocomplete({
  options,
  onSelect,
}: {
  options: ProductAutocompleteOption[];
  onSelect: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return options.filter((o) => o.name.toLowerCase().includes(term)).slice(0, 8);
  }, [options, query]);

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger render={<div className="w-64" />}>
        <Input
          placeholder="Buscar produto..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {filtered.map((o) => (
          <button
            key={o.id}
            type="button"
            className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              onSelect(o.name);
              setQuery("");
              setOpen(false);
            }}
          >
            {o.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
