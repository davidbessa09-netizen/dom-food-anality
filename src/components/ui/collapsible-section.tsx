"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Bloco recolhível reutilizável — inicia fechado por padrão pra reduzir o
 * volume da primeira tela (gráficos e análises secundárias ficam "sob
 * demanda", não empurram a tabela principal pra baixo da dobra). */
export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none flex-row items-center justify-between gap-2 space-y-0"
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <p className="text-base font-semibold">{title}</p>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}
