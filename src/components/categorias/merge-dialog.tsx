"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { mergeCategories, previewCategoryMerge, undoCategoryMerge } from "@/app/(dashboard)/categorias/actions";

export interface MergeCandidate {
  id: string;
  canonicalName: string;
  productCount: number;
}

const UNDO_WINDOW_MS = 15000;

/**
 * Fluxo de mesclagem: escolher canônica → mostrar quantos produtos serão
 * movidos (prévia real, não estimativa) → confirmar → registrar auditoria.
 * Nunca mescla sozinho — a ação só roda quando o usuário clica em
 * "Confirmar mesclagem" depois de ver a prévia. Depois de concluir, oferece
 * "Desfazer" por uma janela curta (mesclar nunca exclui as categorias de
 * origem, então desfazer é seguro enquanto ninguém mexeu de novo nesses
 * produtos).
 */
export function MergeDialog({
  open,
  onOpenChange,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: MergeCandidate[];
}) {
  const [targetId, setTargetId] = useState(candidates[0]?.id ?? "");
  const [preview, setPreview] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  // Deriva "carregando" do próprio preview (sem setState de loading
  // separado): fica null enquanto não chega resposta pra este destino.
  const loadingPreview = open && targetId !== "" && preview === null;

  useEffect(() => {
    if (!open || !targetId) return;
    let cancelled = false;
    previewCategoryMerge(
      candidates.map((c) => c.id),
      targetId
    ).then((result) => {
      if (!cancelled) setPreview(result.productsToMove);
    });
    return () => {
      cancelled = true;
      setPreview(null);
    };
  }, [open, targetId, candidates]);

  async function handleConfirm() {
    setMerging(true);
    try {
      const result = await mergeCategories(
        candidates.map((c) => c.id),
        targetId
      );
      if (result.ok) {
        toast.success("Categorias mescladas.", {
          duration: UNDO_WINDOW_MS,
          action: {
            label: "Desfazer",
            onClick: async () => {
              if (result.moves) {
                const undoResult = await undoCategoryMerge(result.moves);
                if (undoResult.ok) toast.success("Mesclagem desfeita.");
                else toast.error(undoResult.error ?? "Não foi possível desfazer.");
              }
            },
          },
        });
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Falha ao mesclar.");
      }
    } finally {
      setMerging(false);
    }
  }

  const target = candidates.find((c) => c.id === targetId);
  const sourceCount = candidates.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mesclar categorias</DialogTitle>
          <DialogDescription>
            Escolha qual nome vira a categoria canônica — as demais serão esvaziadas (seus
            produtos passam para a escolhida) e continuam existindo até você excluí-las.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={targetId} onValueChange={(v) => setTargetId(String(v))} className="space-y-2">
          {candidates.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <RadioGroupItem value={c.id} />
              <span className="flex-1">{c.canonicalName}</span>
              <span className="text-xs text-muted-foreground">{c.productCount} produto(s)</span>
            </label>
          ))}
        </RadioGroup>

        <div className="rounded-md bg-muted p-3 text-sm">
          {loadingPreview ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Calculando impacto...
            </span>
          ) : (
            <>
              <span className="font-medium">{preview ?? 0} produto(s)</span> de {sourceCount} categoria(s) serão
              movidos para <span className="font-medium">{target?.canonicalName}</span>.
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={merging || loadingPreview}>
            {merging ? "Mesclando..." : "Confirmar mesclagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
