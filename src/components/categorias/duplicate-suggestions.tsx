"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MergeDialog, type MergeCandidate } from "./merge-dialog";

export interface DuplicateGroupForUi {
  brandName: string;
  confidence: "alta" | "média";
  categories: MergeCandidate[];
}

/** Sugestões de duplicidade (exata + quase-duplicata) — nunca mescla
 * sozinho, só lista e oferece o botão que abre o fluxo de mesclagem manual. */
export function DuplicateSuggestions({ groups }: { groups: DuplicateGroupForUi[] }) {
  const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);

  if (groups.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Possíveis duplicatas</CardTitle>
        <CardDescription>
          Detectadas ignorando caixa, acento e espaços extras (alta confiança) ou por
          similaridade de texto (confiança média). Nada é mesclado automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {groups.map((group, index) => (
          <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={group.confidence === "alta" ? "destructive" : "outline"}>
                {group.confidence === "alta" ? "Alta confiança" : "Confiança média"}
              </Badge>
              <span className="text-xs text-muted-foreground">{group.brandName}:</span>
              {group.categories.map((c) => (
                <Badge key={c.id} variant="secondary">
                  {c.canonicalName} ({c.productCount})
                </Badge>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setOpenGroupIndex(index)}>
              Mesclar
            </Button>
          </div>
        ))}
      </CardContent>

      {openGroupIndex !== null && (
        <MergeDialog
          open={openGroupIndex !== null}
          onOpenChange={(o) => !o && setOpenGroupIndex(null)}
          candidates={groups[openGroupIndex].categories}
        />
      )}
    </Card>
  );
}
