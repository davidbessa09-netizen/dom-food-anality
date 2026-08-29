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
import { updateColaboradorModules, resetViewerPassword, setViewerStatus, deleteViewerUser } from "./actions";
import { getAllModuleOptions } from "@/components/dashboard/nav-items";

const MODULE_OPTIONS = getAllModuleOptions();

export function ColaboradorUserActions({
  userId,
  status,
  currentModules,
}: {
  userId: string;
  status: "ativo" | "inativo";
  currentModules: string[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>(currentModules);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSaveModules() {
    setBusy(true);
    try {
      const result = await updateColaboradorModules(userId, selectedModules);
      if (result.ok) {
        toast.success("Abas atualizadas.");
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
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Editar abas liberadas</DropdownMenuItem>
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
            <SheetTitle>Editar abas liberadas</SheetTitle>
            <SheetDescription>Altera quais abas este colaborador pode abrir.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4 text-sm">
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
              {MODULE_OPTIONS.map((m) => (
                <label key={m.key} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedModules.includes(m.key)}
                      onCheckedChange={(c) => setSelectedModules((prev) => (c ? [...prev, m.key] : prev.filter((k) => k !== m.key)))}
                    />
                    {m.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.groupLabel}</span>
                </label>
              ))}
            </div>
            <Button className="w-full" onClick={handleSaveModules} disabled={busy}>
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
