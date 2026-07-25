"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, History, Info, ArrowRight } from "lucide-react";
import { assignOpportunity, setOpportunityDueDate, updateOpportunityStatus, type OpportunityStatus } from "@/app/(dashboard)/recomendacoes/actions";
import { PRIORITY_CONFIG, STATUS_LABELS, ORIGIN_LABELS, CATEGORY_LABELS, type OpportunityRow } from "./opportunity-types";
import { OpportunityHistoryDrawer } from "./opportunity-history-drawer";

const STATUS_OPTIONS: OpportunityStatus[] = ["nova", "em_andamento", "concluida", "ignorada", "arquivada"];

export function OpportunityCard({
  row,
  currentUserId,
  currentUserLabel,
}: {
  row: OpportunityRow;
  currentUserId: string;
  currentUserLabel: string;
}) {
  const [status, setStatus] = useState<OpportunityStatus>(row.status);
  const [assignee, setAssignee] = useState(row.assigneeUserId ?? "");
  const [dueDate, setDueDate] = useState(row.dueDate ?? "");
  const [historyOpen, setHistoryOpen] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[row.priority];

  async function handleStatusChange(next: string | null) {
    if (!next) return;
    const nextStatus = next as OpportunityStatus;
    setStatus(nextStatus);
    const result = await updateOpportunityStatus(row.id, nextStatus);
    if (result.ok) toast.success(`Status atualizado para "${STATUS_LABELS[nextStatus]}".`);
    else toast.error(result.error ?? "Falha ao atualizar status.");
  }

  async function handleAssign(next: string | null) {
    const userId = !next || next === "__unassigned__" ? null : next === "__me__" ? currentUserId : next;
    setAssignee(userId ?? "");
    const result = await assignOpportunity(row.id, userId);
    if (result.ok) toast.success("Responsável atualizado.");
    else toast.error(result.error ?? "Falha ao atribuir.");
  }

  async function handleDueDateChange(value: string) {
    setDueDate(value);
    const result = await setOpportunityDueDate(row.id, value || null);
    if (!result.ok) toast.error(result.error ?? "Falha ao definir prazo.");
  }

  return (
    <Card className={status === "arquivada" || status === "ignorada" ? "opacity-60" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={priorityConfig.variant}>
                {priorityConfig.emoji} {priorityConfig.label}
              </Badge>
              <Badge variant="outline">{CATEGORY_LABELS[row.category]}</Badge>
              <span className="text-xs text-muted-foreground">{row.subcategory}</span>
            </div>
            <h3 className="text-base font-semibold">{row.title}</h3>
          </div>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40">
              <SelectValue>{() => STATUS_LABELS[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{row.description}</p>

        <div className="flex items-center gap-1.5">
          <Badge variant="secondary">{ORIGIN_LABELS[row.originType]}</Badge>
          <Tooltip>
            <TooltipTrigger render={<button type="button" aria-label="Explicação da origem" />}>
              <Info className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-72">
              {row.originExplanation}
            </TooltipContent>
          </Tooltip>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Evidências</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {row.evidence.map((e, i) => (
              <li key={i} className="text-xs">
                <span className="text-muted-foreground">{e.label}:</span> <span className="font-medium">{e.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {row.affectedBrands.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Marcas afetadas</p>
            <div className="flex flex-wrap gap-1">
              {row.affectedBrands.map((b) => (
                <Badge key={b} variant="outline">
                  {b}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {row.expectedImpact.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Impacto esperado</p>
            <ul className="space-y-0.5">
              {row.expectedImpact.map((impact, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-success" /> {impact}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Ação sugerida</p>
          <p className="text-xs">{row.suggestedAction}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${row.score}%` }} />
          </div>
          <Tooltip>
            <TooltipTrigger render={<span className="cursor-help text-xs font-medium whitespace-nowrap" />}>Score {row.score}/100</TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              {row.scoreExplanation}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {row.dashboardLink && (
              <Button size="sm" variant="outline" render={<Link href={row.dashboardLink} />} nativeButton={false}>
                Ver análise <ArrowRight className="size-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
              <History className="size-3.5" /> Histórico
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={assignee || "__unassigned__"} onValueChange={handleAssign}>
              <SelectTrigger className="w-36">
                <SelectValue>
                  {() => (assignee === "" ? "Não atribuído" : assignee === currentUserId ? currentUserLabel : `Usuário ${assignee.slice(0, 8)}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">Não atribuído</SelectItem>
                <SelectItem value="__me__">{currentUserLabel}</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dueDate} onChange={(e) => handleDueDateChange(e.target.value)} className="w-36" />
          </div>
        </div>
      </CardContent>

      <OpportunityHistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} opportunityId={row.id} title={row.title} />
    </Card>
  );
}
