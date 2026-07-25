"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * Toggle de "normalizar por dia aberto" — o sistema ainda não tem um
 * calendário operacional (dias/horários de funcionamento) por loja, então o
 * toggle existe mas não inventa números: quando ligado, a página mostra um
 * aviso explicando que a normalização está indisponível em vez de estimar
 * dias abertos a partir dos próprios pedidos (o que inflaria lojas com mais
 * dados sincronizados e penalizaria as com sincronização mais recente).
 */
export function NormalizeToggle({ checked }: { checked: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(next: boolean) {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("normalize", "1");
    else params.delete("normalize");
    router.push(`?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={handleChange} size="sm" />
      <Label className="cursor-pointer font-normal text-muted-foreground">Normalizar por dia aberto</Label>
    </label>
  );
}
