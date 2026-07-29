"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MoreHorizontal } from "lucide-react";
import { updateViewerStores, resetViewerPassword, setViewerStatus, deleteViewerUser } from "./actions";

interface StoreOption {
  id: string;
  name: string;
}

export function ViewerUserActions({
  userId,
  status,
  stores,
  currentStoreNames,
  allStores,
}: {
  userId: string;
  status: "ativo" | "inativo";
  stores: StoreOption[];
  currentStoreNames: string[];
  allStores: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [selectedStores, setSelectedStores] = useState<string[]>(stores.filter((s) => currentStoreNames.includes(s.name)).map((s) => s.id));
  const [editAllStores, setEditAllStores] = useState(allStores);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSaveStores() {
    setBusy(true);
    try {
      const result = await updateViewerStores(userId, editAllStores ? [] : selectedStores);
      if (result.ok) {
        toast.success("Lojas atualizadas.");
        setEditOpen(false);
      } else {
        toast.error(result.error ?? "Falha ao atualizar.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    setBusy(true);
    try {
      const result = await resetViewerPassword(userId, newPassword);
      if (result.ok) {
        toast.success("Senha redefinida.");
        setResetOpen(false);
        setNewPassword("");
      } else {
        toast.error(result.error ?? "Falha ao redefinir senha.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStatus() {
    const next = status === "ativo" ? "inativo" : "ativo";
    const result = await setViewerStatus(userId, next);
    if (result.ok) toast.success(next === "ativo" ? "Acesso ativado." : "Acesso bloqueado.");
    else toast.error(result.error ?? "Falha ao atualizar status.");
  }

  async function handleDelete() {
    if (!confirm("Excluir este acesso definitivamente? Essa ação não pode ser desfeita.")) return;
    const result = await deleteViewerUser(userId);
    if (result.ok) toast.success("Acesso excluído.");
    else toast.error(result.error ?? "Falha ao excluir.");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Editar lojas</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setResetOpen(true)}>Redefinir senha</DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggleStatus}>{status === "ativo" ? "Bloquear agora" : "Ativar"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleDelete}>
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Editar lojas permitidas</SheetTitle>
            <SheetDescription>Altera quais lojas este acesso pode visualizar.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4 text-sm">
            <label className="flex items-center gap-2 rounded-md border p-2">
              <Checkbox checked={editAllStores} onCheckedChange={(c) => setEditAllStores(Boolean(c))} />
              <span>Todas as lojas</span>
            </label>
            {!editAllStores && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {stores.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 py-0.5">
                    <Checkbox
                      checked={selectedStores.includes(s.id)}
                      onCheckedChange={(c) => setSelectedStores((prev) => (c ? [...prev, s.id] : prev.filter((id) => id !== s.id)))}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
            <Button className="w-full" onClick={handleSaveStores} disabled={busy}>
              Salvar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={resetOpen} onOpenChange={setResetOpen}>
        <SheetContent side="right" className="sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Redefinir senha</SheetTitle>
            <SheetDescription>Como não há e-mail, a recuperação de senha é feita só por aqui.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4 text-sm">
            <Input type="password" placeholder="Nova senha temporária" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} />
            <Button className="w-full" onClick={handleResetPassword} disabled={busy || newPassword.length < 8}>
              Redefinir
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
