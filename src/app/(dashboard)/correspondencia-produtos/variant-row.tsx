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
import { approveVariantMatch, createProductFromVariant, rejectVariantMatch } from "./actions";

interface ProductOption {
  id: string;
  canonical_name: string;
}

export function VariantRow({
  variantId,
  originalName,
  brandId,
  brandName,
  platform,
  products,
  suggestion,
  price,
  categoryName,
  categoryId,
}: {
  variantId: string;
  originalName: string;
  brandId: string;
  brandName: string;
  platform: string;
  products: ProductOption[];
  suggestion: { productId: string; name: string; score: number } | null;
  price?: number | null;
  categoryName?: string | null;
  categoryId?: string | null;
}) {
  const [selected, setSelected] = useState(suggestion?.productId ?? "");
  const [newName, setNewName] = useState(originalName);
  const [busy, setBusy] = useState(false);

  async function handleApprove() {
    if (!selected) {
      toast.error("Selecione um produto para vincular.");
      return;
    }
    setBusy(true);
    try {
      const res = await approveVariantMatch(variantId, selected);
      if (res.ok) toast.success("Vínculo aprovado.");
      else toast.error(res.error ?? "Falha ao aprovar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      await rejectVariantMatch(variantId);
      toast.success("Marcado como rejeitado.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNew() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const res = await createProductFromVariant(variantId, brandId, newName.trim(), categoryId, price);
      if (res.ok) toast.success("Produto criado e vinculado.");
      else toast.error(res.error ?? "Falha ao criar produto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{originalName}</span>
        <Badge variant="outline">{brandName}</Badge>
        <Badge variant="secondary">{platform}</Badge>
        {price != null && <Badge variant="outline">R$ {price.toFixed(2)}</Badge>}
        {categoryName && <Badge variant="outline">{categoryName}</Badge>}
        {suggestion && (
          <Badge variant={suggestion.score > 0.5 ? "default" : "outline"}>
            Sugestão: {suggestion.name} ({Math.round(suggestion.score * 100)}%)
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select value={selected} onValueChange={(value) => setSelected(value ?? "")}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Vincular a produto existente">
              {() => products.find((p) => p.id === selected)?.canonical_name ?? "Vincular a produto existente"}
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
        <Button size="sm" onClick={handleApprove} disabled={busy || !selected}>
          Aprovar vínculo
        </Button>
        <Button size="sm" variant="outline" onClick={handleReject} disabled={busy}>
          Rejeitar
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t pt-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-64"
          placeholder="Nome do produto canônico"
        />
        <Button size="sm" variant="secondary" onClick={handleCreateNew} disabled={busy}>
          Criar como novo produto
        </Button>
      </div>
    </div>
  );
}
