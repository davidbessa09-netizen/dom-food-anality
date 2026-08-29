"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Copy, UserPlus } from "lucide-react";
import { createProductsViewerUser } from "./actions";
import { getAllModuleOptions } from "@/components/dashboard/nav-items";

interface StoreOption {
  id: string;
  name: string;
}

type AccessRole = "products_viewer" | "vendas_viewer" | "admin_geral" | "colaborador";

const ROLE_LABELS: Record<AccessRole, string> = {
  products_viewer: "Visualizador de produtos",
  vendas_viewer: "Visualizador de vendas",
  admin_geral: "Administrador geral",
  colaborador: "Colaborador",
};

const MODULE_OPTIONS = getAllModuleOptions();

export function NewAccessButton({ stores }: { stores: StoreOption[] }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<AccessRole>("products_viewer");
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [allStores, setAllStores] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdCredential, setCreatedCredential] = useState<{ username: string; password: string } | null>(null);

  function resetForm() {
    setDisplayName("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setRole("products_viewer");
    setSelectedStores([]);
    setAllStores(false);
    setSelectedModules([]);
    setMustChangePassword(true);
    setExpiresAt("");
    setNote("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (role === "products_viewer" && !allStores && selectedStores.length === 0) {
      toast.error('Selecione ao menos uma loja, ou marque "Todas as lojas".');
      return;
    }
    if (role === "colaborador" && selectedModules.length === 0) {
      toast.error("Selecione ao menos uma aba pra liberar.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createProductsViewerUser({
        displayName,
        username,
        password,
        role,
        storeIds: allStores ? [] : selectedStores,
        modules: selectedModules,
        mustChangePassword,
        expiresAt: expiresAt || null,
        note: note || null,
      });
      if (result.ok) {
        setCreatedCredential({ username: username.trim().toLowerCase(), password });
        setOpen(false);
        resetForm();
      } else {
        toast.error(result.error ?? "Falha ao criar acesso.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyCredential() {
    if (!createdCredential) return;
    const text = `Usuário: ${createdCredential.username}\nSenha temporária: ${createdCredential.password}`;
    navigator.clipboard.writeText(text);
    toast.success("Copiado.");
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Novo usuário
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>Cria um acesso sem e-mail — só nome de usuário e senha.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Nome da pessoa</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Nome de usuário</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="gerentegulas"
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">Só letras minúsculas, números, ponto, traço ou underline. Precisa ser único.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha temporária</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirmar senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Perfil de acesso</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AccessRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => ROLE_LABELS[role]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="products_viewer">Visualizador de produtos</SelectItem>
                  <SelectItem value="vendas_viewer">Visualizador de vendas</SelectItem>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="admin_geral">Administrador geral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {role === "admin_geral" && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>Este usuário terá acesso administrativo completo — todas as páginas, todas as lojas, e poderá gerenciar outros usuários.</span>
              </div>
            )}

            {role === "vendas_viewer" && (
              <div className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                Este acesso vê só a aba Vendas (análise + transações) — sempre da organização inteira, sem escopo por loja.
              </div>
            )}

            {role === "colaborador" && (
              <div className="space-y-1.5">
                <Label>Abas liberadas</Label>
                <p className="text-xs text-muted-foreground">
                  Acesso de dado igual ao administrador (organização inteira), mas só enxerga as abas marcadas abaixo.
                </p>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                  {MODULE_OPTIONS.map((m) => (
                    <label key={m.key} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                      <span className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedModules.includes(m.key)}
                          onCheckedChange={(c) =>
                            setSelectedModules((prev) => (c ? [...prev, m.key] : prev.filter((k) => k !== m.key)))
                          }
                        />
                        {m.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{m.groupLabel}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {role === "products_viewer" && (
              <div className="space-y-1.5">
                <Label>Lojas permitidas</Label>
                <label className="flex items-center gap-2 rounded-md border p-2">
                  <Checkbox checked={allStores} onCheckedChange={(c) => setAllStores(Boolean(c))} />
                  <span className="text-sm">Todas as lojas</span>
                </label>
                {!allStores && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                    {stores.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 py-0.5">
                        <Checkbox
                          checked={selectedStores.includes(s.id)}
                          onCheckedChange={(c) => setSelectedStores((prev) => (c ? [...prev, s.id] : prev.filter((id) => id !== s.id)))}
                        />
                        <span className="text-sm">{s.name}</span>
                      </label>
                    ))}
                    {stores.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma loja cadastrada.</p>}
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center justify-between rounded-md border p-2">
              <span className="text-sm">Exigir troca de senha no primeiro acesso</span>
              <Switch checked={mustChangePassword} onCheckedChange={setMustChangePassword} />
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="expiresAt">Data de expiração (opcional)</Label>
              <Input id="expiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Observação (opcional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>

            <DialogFooter>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Criando..." : "Criar acesso"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createdCredential !== null} onOpenChange={(o) => !o && setCreatedCredential(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Acesso criado com sucesso</DialogTitle>
            <DialogDescription>Esta senha não será exibida novamente — anote ou copie agora.</DialogDescription>
          </DialogHeader>
          {createdCredential && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                <span className="text-muted-foreground">Nome de usuário:</span> <span className="font-mono font-medium">{createdCredential.username}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Senha temporária:</span>{" "}
                <span className="font-mono font-medium">{createdCredential.password}</span>
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleCopyCredential} className="flex-1">
              <Copy className="size-3.5" />
              Copiar acesso
            </Button>
            <Button onClick={() => setCreatedCredential(null)} className="flex-1">
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
