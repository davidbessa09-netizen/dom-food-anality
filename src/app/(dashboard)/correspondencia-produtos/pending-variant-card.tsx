"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  approveVariantMatch,
  createProductFromVariant,
  rejectVariantMatch,
  undoVariantAction,
  type VariantActionResult,
} from "./actions";

interface ProductOption {
  id: string;
  canonical_name: string;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const UNDO_WINDOW_MS = 15000;

export function PendingVariantCard({
  variantId,
  originalName,
  brandId,
  brandName,
  storeName,
  platform,
  products,
  suggestion,
  price,
  categoryName,
  categoryId,
  impact,
}: {
  variantId: string;
  originalName: string;
  brandId: string;
  brandName: string;
  storeName: string;
  platform: string;
  products: ProductOption[];
  suggestion: { productId: string; name: string; score: number; categoryMatches: boolean | null } | null;
  price?: number | null;
  categoryName?: string | null;
  categoryId?: string | null;
  impact: { orders: number; revenue: number };
}) {
  const [selected, setSelected] = useState(suggestion?.productId ?? "");
  const [newName, setNewName] = useState(originalName);
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState(false);

  function offerUndo(label: string, result: VariantActionResult) {
    if (!result.previousState) return;
    toast.success(label, {
      duration: UNDO_WINDOW_MS,
      action: {
        label: "Desfazer",
        onClick: async () => {
          const undoResult = await undoVariantAction(variantId, result.previousState!, result.createdProductId);
          if (undoResult.ok) {
            toast.success("Ação desfeita.");
            setResolved(false);
          } else {
            toast.error(undoResult.error ?? "Não foi possível desfazer.");
          }
        },
      },
    });
  }

  async function handleApprove(productId: string) {
    if (!productId) {
      toast.error("Selecione um produto para vincular.");
      return;
    }
    setBusy(true);
    try {
      const res = await approveVariantMatch(variantId, productId);
      if (res.ok) {
        setResolved(true);
        offerUndo("Vínculo aprovado.", res);
      } else toast.error(res.error ?? "Falha ao aprovar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      const res = await rejectVariantMatch(variantId);
      if (res.ok) {
        setResolved(true);
        offerUndo("Marcado como rejeitado.", res);
      } else toast.error(res.error ?? "Falha ao rejeitar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNew() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const res = await createProductFromVariant(variantId, brandId, newName.trim(), categoryId, price);
      if (res.ok) {
        setResolved(true);
        offerUndo("Produto criado e vinculado.", res);
      } else toast.error(res.error ?? "Falha ao criar produto.");
    } finally {
      setBusy(false);
    }
  }

  if (resolved) return null;

  const scorePct = suggestion ? Math.round(suggestion.score * 100) : null;
  const scoreVariant = scorePct === null ? "outline" : scorePct >= 85 ? "default" : scorePct >= 50 ? "secondary" : "outline";

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{originalName}</span>
        <Badge variant="secondary">{platform}</Badge>
        <Badge variant="outline">{brandName}</Badge>
        <Badge variant="outline">{storeName}</Badge>
        {price != null && <Badge variant="outline">{formatCurrency(price)}</Badge>}
        {categoryName && <Badge variant="outline">{categoryName}</Badge>}
      </div>

      <div className="text-xs text-muted-foreground">
        {impact.orders > 0 ? (
          <span>
            Impacto: <span className="font-medium text-foreground">{impact.orders} pedido(s)</span> ·{" "}
            <span className="font-medium text-foreground">{formatCurrency(impact.revenue)}</span> em faturamento com este nome de item.
          </span>
        ) : (
          <span>Sem pedidos registrados com este nome de item ainda.</span>
        )}
      </div>

      {suggestion && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted p-2">
          <span className="text-xs">Sugestão:</span>
          <span className="text-xs font-medium">{suggestion.name}</span>
          <Badge variant={scoreVariant}>{scorePct}% de similaridade</Badge>
          {suggestion.categoryMatches === true && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="size-3" /> Mesma categoria
            </Badge>
          )}
          {suggestion.categoryMatches === false && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="size-3" /> Categoria diferente — revisar com atenção
            </Badge>
          )}
          <Button size="sm" onClick={() => handleApprove(suggestion.productId)} disabled={busy}>
            Aprovar sugestão
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Select value={selected} onValueChange={(value) => setSelected(value ?? "")}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Escolher outro produto">
              {() => products.find((p) => p.id === selected)?.canonical_name ?? "Escolher outro produto"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.canonical_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => handleApprove(selected)} disabled={busy || !selected}>
          Vincular
        </Button>
        <Button size="sm" variant="ghost" onClick={handleReject} disabled={busy}>
          Rejeitar
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t pt-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-64" placeholder="Nome do produto canônico" />
        <Button size="sm" variant="secondary" onClick={handleCreateNew} disabled={busy}>
          Criar produto canônico
        </Button>
      </div>
    </div>
  );
}
