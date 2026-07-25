"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSavedView, deleteSavedView, listSavedViews, type SavedView } from "@/lib/filters/saved-views-actions";
import { Bookmark, Trash2 } from "lucide-react";

export function SaveViewButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      listSavedViews(pathname).then(setViews);
    }
  }, [open, pathname]);

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const params = Object.fromEntries(searchParams.entries());
      const result = await createSavedView(pathname, name.trim(), params);
      if (result.ok) {
        toast.success("Visão salva.");
        setDialogOpen(false);
        setName("");
      } else {
        toast.error(result.error ?? "Falha ao salvar visão.");
      }
    } finally {
      setBusy(false);
    }
  }

  function applyView(view: SavedView) {
    const params = new URLSearchParams(view.params);
    router.push(`${pathname}?${params.toString()}`);
  }

  async function removeView(view: SavedView) {
    const result = await deleteSavedView(view.id, pathname);
    if (result.ok) {
      setViews((prev) => prev.filter((v) => v.id !== view.id));
      toast.success("Visão removida.");
    } else {
      toast.error(result.error ?? "Falha ao remover.");
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <Bookmark className="size-4" />
          Visões salvas
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Visões salvas nesta página</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {views.map((view) => (
            <div key={view.id} className="flex items-center gap-1">
              <DropdownMenuItem className="flex-1" onClick={() => applyView(view)}>
                {view.name}
              </DropdownMenuItem>
              <button
                type="button"
                aria-label={`Remover visão ${view.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeView(view);
                }}
                className="rounded-sm p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {views.length === 0 && (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">Nenhuma visão salva ainda.</p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setDialogOpen(true);
            }}
          >
            + Salvar filtros atuais
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar visão</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Nome da visão (ex.: Nikô Sushi — 30 dias)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={busy || !name.trim()}>
              {busy ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
