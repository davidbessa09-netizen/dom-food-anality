"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { addOpportunityNote, getOpportunityHistory, type OpportunityHistoryEntry, type OpportunityNoteEntry } from "@/app/(dashboard)/recomendacoes/actions";

const EVENT_LABELS: Record<string, string> = {
  created: "Oportunidade criada",
  viewed: "Visualizada",
  status_changed: "Status alterado",
  note_added: "Observação adicionada",
  assigned: "Responsável definido",
  due_date_set: "Prazo definido",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

export function OpportunityHistoryDrawer({
  open,
  onOpenChange,
  opportunityId,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string | null;
  title: string;
}) {
  const [data, setData] = useState<{ events: OpportunityHistoryEntry[]; notes: OpportunityNoteEntry[] } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const loading = open && opportunityId !== null && data === null;

  useEffect(() => {
    if (!open || !opportunityId) return;
    let cancelled = false;
    getOpportunityHistory(opportunityId).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
      setData(null);
    };
  }, [open, opportunityId]);

  async function handleAddNote() {
    if (!opportunityId || note.trim().length === 0) return;
    setSaving(true);
    try {
      const result = await addOpportunityNote(opportunityId, note);
      if (result.ok) {
        toast.success("Observação salva.");
        setNote("");
        const refreshed = await getOpportunityHistory(opportunityId);
        setData(refreshed);
      } else {
        toast.error(result.error ?? "Falha ao salvar.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Histórico</SheetTitle>
          <SheetDescription>{title}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 text-sm">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando histórico...
            </div>
          )}
          {!loading && data && (
            <>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Observações</p>
                <ul className="space-y-2">
                  {data.notes.map((n) => (
                    <li key={n.id} className="rounded-md border p-2 text-xs">
                      <p>{n.note}</p>
                      <p className="mt-1 text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                    </li>
                  ))}
                  {data.notes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma observação ainda.</p>}
                </ul>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Linha do tempo</p>
                <ul className="space-y-1.5">
                  {data.events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
                      <span>{EVENT_LABELS[e.eventType] ?? e.eventType}</span>
                      <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                    </li>
                  ))}
                  {data.events.length === 0 && <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>}
                </ul>
              </div>
            </>
          )}
        </div>
        <SheetFooter className="gap-2">
          <Textarea placeholder="Adicionar observação..." value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
          <Button onClick={handleAddNote} disabled={saving || note.trim().length === 0}>
            {saving ? "Salvando..." : "Adicionar observação"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
