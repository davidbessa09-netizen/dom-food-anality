import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface BestPerformerCardProps {
  label: string;
  icon: ReactNode;
  storeName?: string;
  brandName?: string;
  value?: string;
  emptyReason?: string;
}

/** Card de "melhor X" — só recebe storeName/value quando existe pelo menos
 * uma loja elegível (ver isEligibleForRanking); caso contrário mostra um
 * estado vazio explicando o motivo, nunca um valor inventado. */
export function BestPerformerCard({ label, icon, storeName, brandName, value, emptyReason }: BestPerformerCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {icon}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {storeName ? (
          <>
            <p className="truncate text-lg font-semibold">{storeName}</p>
            <p className="text-xs text-muted-foreground">{brandName}</p>
            <p className="text-sm font-medium tabular-nums">{value}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyReason ?? "Sem dado suficiente para calcular."}</p>
        )}
      </CardContent>
    </Card>
  );
}
