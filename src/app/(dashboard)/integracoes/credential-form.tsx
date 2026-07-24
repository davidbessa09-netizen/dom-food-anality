"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveAnotaAiCredential, type SaveCredentialState } from "./actions";

interface ChannelOption {
  salesChannelId: string;
  label: string;
}

const initialState: SaveCredentialState = {};

export function CredentialForm({ channels }: { channels: ChannelOption[] }) {
  const [state, formAction, pending] = useActionState(saveAnotaAiCredential, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [salesChannelId, setSalesChannelId] = useState("");

  useEffect(() => {
    if (state.success) {
      toast.success("Token salvo. Já pode clicar em \"Sincronizar agora\".");
      formRef.current?.reset();
    }
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="sales_channel_id">Loja (canal Anota AI)</Label>
        <Select
          name="sales_channel_id"
          required
          onValueChange={(v: unknown) => setSalesChannelId(typeof v === "string" ? v : "")}
        >
          <SelectTrigger id="sales_channel_id" className="w-64">
            <SelectValue placeholder="Selecione">
              {() => channels.find((c) => c.salesChannelId === salesChannelId)?.label ?? "Selecione"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c.salesChannelId} value={c.salesChannelId}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="token">Token do estabelecimento (Portal de Integração)</Label>
        <Input id="token" name="token" type="password" required className="w-80" placeholder="Cole o token aqui" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar token"}
      </Button>
    </form>
  );
}
