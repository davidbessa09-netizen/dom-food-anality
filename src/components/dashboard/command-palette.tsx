"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { NavGroup } from "./nav-items";
import { Search } from "lucide-react";

/** Busca real de navegação — filtra os itens de menu já existentes, nunca
 * inventa resultado nem simula uma busca em dados que o usuário não tem
 * acesso (o menu já vem pré-filtrado por permissão). */
export function CommandPalette({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const flat = groups.flatMap((g) => g.items.map((item) => ({ ...item, groupLabel: g.label })));
    if (!term) return flat;
    return flat.filter((item) => item.label.toLowerCase().includes(term) || item.groupLabel.toLowerCase().includes(term));
  }, [groups, query]);

  function goTo(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Buscar página...</span>
        <kbd className="ml-2 hidden rounded border bg-muted px-1.5 py-0.5 text-xs sm:inline">Ctrl K</kbd>
      </button>
      <DialogContent className="max-w-md gap-0 p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Buscar página</DialogTitle>
        <div className="border-b p-2">
          <Input
            autoFocus
            placeholder="Buscar página do sistema..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.map((item) => (
            <li key={item.href}>
              <button
                type="button"
                onClick={() => goTo(item.href)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <item.icon className="size-4 text-muted-foreground" />
                <span>{item.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{item.groupLabel}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma página encontrada.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
