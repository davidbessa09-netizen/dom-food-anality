"use client";

import { CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

/** Rótulo de KPI com tooltip de definição — para o usuário nunca precisar
 * adivinhar a base de cálculo (ver METRICS_AUDIT.md). */
export function KpiLabel({ label, definition }: { label: string; definition: string }) {
  return (
    <CardDescription className="flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger render={<button type="button" aria-label={`Definição de ${label}`} />}>
          <Info className="size-3.5 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-left">
          {definition}
        </TooltipContent>
      </Tooltip>
    </CardDescription>
  );
}
