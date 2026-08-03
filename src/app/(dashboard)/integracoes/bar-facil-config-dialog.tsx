"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { saveBarFacilConfig, type BarFacilIntegrationSummary, type SaveBarFacilConfigState } from "./bar-facil-actions";

const initialState: SaveBarFacilConfigState = {};

/**
 * Campos alinhados com a documentação oficial do Bar Fácil: um único
 * token (header `Authorization`, gerado na tela "Gestão de Integradores"
 * do BF Play) e o ambiente (produção/homologação — URLs fixas, ver
 * BAR_FACIL_BASE_URLS). O token nunca é pré-preenchido nem reexibido.
 */
export function BarFacilConfigDialog({ summary }: { summary: BarFacilIntegrationSummary }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveBarFacilConfig, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("Configuração salva.");
      const timer = setTimeout(() => setOpen(false), 0);
      return () => clearTimeout(timer);
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Settings className="size-3.5" />
        Configurar
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar Bar Fácil</DialogTitle>
          <DialogDescription>
            Token gerado na tela &quot;Gestão de Integradores&quot; do BF Play. Fica criptografado no servidor e nunca é
            reenviado ao navegador.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="token">Token de autenticação {summary.hasCredentials && <span className="text-xs text-muted-foreground">(já cadastrado)</span>}</Label>
            <Input id="token" name="token" type="password" placeholder="•••• deixe em branco pra manter o atual" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="environment">Ambiente</Label>
            <Select name="environment" defaultValue={summary.config.environment ?? "producao"}>
              <SelectTrigger id="environment" className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="producao">Produção (api.ticketmais.com.br)</SelectItem>
                <SelectItem value="homologacao">Homologação (deploy-api.ticketmais.com.br)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="timezone">Fuso horário do evento</Label>
            <Input id="timezone" name="timezone" placeholder="America/Sao_Paulo" defaultValue={summary.config.timezone ?? "America/Sao_Paulo"} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="import_start_date">Data inicial da importação (referência p/ backfill)</Label>
            <Input id="import_start_date" name="import_start_date" type="date" defaultValue={summary.config.importStartDate ?? ""} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar configuração"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
