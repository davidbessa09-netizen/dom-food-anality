"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link2, RefreshCw } from "lucide-react";
import {
  importBarFacilEventsAsPendingLinks,
  listBarFacilEstablishmentLinks,
  listStoresForBarFacilMapping,
  setBarFacilEstablishmentLinkStatus,
  upsertBarFacilEstablishmentLink,
  type BarFacilEstablishmentLinkRow,
  type StoreOption,
  type UpsertLinkState,
} from "./bar-facil-actions";

const STATUS_LABELS: Record<BarFacilEstablishmentLinkRow["status"], string> = {
  pendente: "Pendente",
  vinculado: "Vinculado",
  ignorado: "Ignorado",
  revisar: "Revisar",
};

function statusVariant(status: BarFacilEstablishmentLinkRow["status"]): "default" | "destructive" | "secondary" | "outline" {
  if (status === "vinculado") return "default";
  if (status === "revisar") return "destructive";
  if (status === "ignorado") return "secondary";
  return "outline";
}

const initialState: UpsertLinkState = {};

export function BarFacilMappingDialog() {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<BarFacilEstablishmentLinkRow[] | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [state, formAction, pending] = useActionState(upsertBarFacilEstablishmentLink, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([listBarFacilEstablishmentLinks(), listStoresForBarFacilMapping()]).then(([l, s]) => {
      if (!cancelled) {
        setLinks(l);
        setStores(s);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, state]);

  useEffect(() => {
    if (state.success) {
      toast.success("Vínculo salvo.");
      formRef.current?.reset();
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  async function handleStatusChange(linkId: string, status: BarFacilEstablishmentLinkRow["status"]) {
    await setBarFacilEstablishmentLinkStatus(linkId, status);
    setLinks(await listBarFacilEstablishmentLinks());
  }

  async function handleImportFromApi() {
    setImporting(true);
    try {
      const result = await importBarFacilEventsAsPendingLinks();
      if (result.error) toast.error(result.error);
      else toast.success(`${result.imported} evento(s) novo(s) importado(s) como pendente.`);
      setLinks(await listBarFacilEstablishmentLinks());
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Link2 className="size-3.5" />
        Mapeamento de lojas
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mapeamento de estabelecimentos/eventos Bar Fácil → lojas</DialogTitle>
          <DialogDescription>
            O vínculo sempre usa o ID oficial do estabelecimento/evento retornado pela API — nunca é feito por nome.
          </DialogDescription>
        </DialogHeader>

        <Button size="sm" variant="outline" onClick={handleImportFromApi} disabled={importing} className="w-fit">
          <RefreshCw className={importing ? "size-3.5 animate-spin" : "size-3.5"} />
          {importing ? "Buscando..." : "Buscar eventos da API"}
        </Button>

        <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="external_establishment_id">ID do estabelecimento/evento</Label>
            <Input id="external_establishment_id" name="external_establishment_id" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="external_establishment_name">Nome (só exibição)</Label>
            <Input id="external_establishment_name" name="external_establishment_name" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="external_event_id">ID do evento (opcional)</Label>
            <Input id="external_event_id" name="external_event_id" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="store_id">Loja DOM Food Analytics</Label>
            <Select name="store_id">
              <SelectTrigger id="store_id" className="w-full">
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <input type="hidden" name="status" value="vinculado" />
          <DialogFooter className="col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Salvando..." : "Vincular"}
            </Button>
          </DialogFooter>
        </form>

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {links === null && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {links?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum vínculo cadastrado ainda.</p>}
          {links?.map((link) => (
            <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div>
                <p className="font-medium">{link.externalEstablishmentName ?? link.externalEstablishmentId}</p>
                <p className="text-xs text-muted-foreground">
                  ID: {link.externalEstablishmentId}
                  {link.externalEventId ? ` · Evento: ${link.externalEventId}` : ""} → {link.storeName ?? "Sem loja vinculada"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(link.status)}>{STATUS_LABELS[link.status]}</Badge>
                {link.status !== "vinculado" && (
                  <Button size="sm" variant="ghost" onClick={() => handleStatusChange(link.id, "vinculado")}>
                    Vincular
                  </Button>
                )}
                {link.status !== "ignorado" && (
                  <Button size="sm" variant="ghost" onClick={() => handleStatusChange(link.id, "ignorado")}>
                    Ignorar
                  </Button>
                )}
                {link.status !== "revisar" && (
                  <Button size="sm" variant="ghost" onClick={() => handleStatusChange(link.id, "revisar")}>
                    Revisar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
