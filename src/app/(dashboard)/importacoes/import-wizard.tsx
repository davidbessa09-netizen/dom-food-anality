"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { IMPORT_TEMPLATE_FIELDS } from "@/lib/validations/import";
import { autoMapColumns } from "@/lib/validations/column-mapping";
import { importOrders, type ImportOrdersResult } from "./actions";

const FIELD_LABELS: Record<string, string> = {
  pedido_id: "ID do pedido *",
  data_pedido: "Data do pedido *",
  status: "Status *",
  tipo_entrega: "Tipo de entrega",
  forma_pagamento: "Forma de pagamento",
  valor_bruto: "Valor bruto *",
  desconto: "Desconto",
  taxa_entrega: "Taxa de entrega",
  valor_liquido: "Valor líquido",
  bairro: "Bairro",
  cliente_nome: "Nome do cliente",
  cliente_telefone: "Telefone do cliente",
  cliente_email: "E-mail do cliente",
  motivo_cancelamento: "Motivo do cancelamento",
  itens: "Itens (ex.: \"2x Combo Chef; 1x Refri\")",
};

const REQUIRED_FIELDS = ["pedido_id", "data_pedido", "status", "valor_bruto"];

interface StoreOption {
  id: string;
  name: string;
  brandName: string;
  channels: { id: string; platform: string }[];
}

function downloadTemplate() {
  const fields = IMPORT_TEMPLATE_FIELDS.pedidos;
  const csv = fields.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-pedidos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({ stores }: { stores: StoreOption[] }) {
  const [storeId, setStoreId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportOrdersResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedStore = stores.find((s) => s.id === storeId);

  const missingRequiredFields = useMemo(
    () => REQUIRED_FIELDS.filter((field) => !mapping[field]),
    [mapping]
  );

  const previewRows = useMemo(
    () =>
      rows.slice(0, 5).map((row) => {
        const mapped: Record<string, string> = {};
        for (const field of IMPORT_TEMPLATE_FIELDS.pedidos) {
          const col = mapping[field];
          mapped[field] = col ? row[col] ?? "" : "";
        }
        return mapped;
      }),
    [rows, mapping]
  );

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      // Remove BOM (comum em CSV salvo pelo Excel) e detecta o delimitador
      // automaticamente — Excel em português costuma salvar com ";" em vez
      // de ",", já que a vírgula é o separador decimal nesse locale.
      const text = String(reader.result ?? "").replace(/^﻿/, "");
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        delimitersToGuess: [",", ";", "\t", "|"],
      });
      const fields = parsed.meta.fields ?? [];
      setHeaders(fields);
      setRows(parsed.data);
      setMapping(autoMapColumns(fields, IMPORT_TEMPLATE_FIELDS.pedidos));
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleImport() {
    if (!storeId || !channelId || rows.length === 0) {
      toast.error("Selecione a loja, o canal e um arquivo com linhas válidas.");
      return;
    }
    setImporting(true);
    try {
      const res = await importOrders({
        storeId,
        salesChannelId: channelId,
        fileName,
        mapping,
        rawRows: rows,
      });
      setResult(res);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Importação concluída: ${res.rowsImported} de ${res.rowsTotal} linha(s).`);
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Loja e arquivo</CardTitle>
          <CardDescription>
            Modelo de planilha:{" "}
            <button type="button" onClick={downloadTemplate} className="underline">
              baixar modelo-pedidos.csv
            </button>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Loja</Label>
            <Select
              value={storeId}
              onValueChange={(v) => {
                setStoreId(v ?? "");
                const store = stores.find((s) => s.id === v);
                setChannelId(store?.channels[0]?.id ?? "");
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Selecione a loja">
                  {() => {
                    const s = stores.find((s) => s.id === storeId);
                    return s ? `${s.brandName} — ${s.name}` : "Selecione a loja";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.brandName} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Canal</Label>
            <Select value={channelId} onValueChange={(v) => setChannelId(v ?? "")} disabled={!selectedStore}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Canal">
                  {() => selectedStore?.channels.find((c) => c.id === channelId)?.platform ?? "Canal"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(selectedStore?.channels ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="file">Arquivo CSV</Label>
            <input
              ref={fileInputRef}
              id="file"
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              {fileName || "Selecionar arquivo..."}
            </Button>
          </div>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">2. Mapeamento de colunas</CardTitle>
                <CardDescription>
                  {rows.length} linha(s) detectada(s) em &quot;{fileName}&quot;. Campos com * são
                  obrigatórios.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {missingRequiredFields.length > 0 && (
                  <Badge variant="destructive">
                    {missingRequiredFields.length} campo(s) obrigatório(s) sem coluna
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMapping(autoMapColumns(headers, IMPORT_TEMPLATE_FIELDS.pedidos))}
                >
                  Detectar automaticamente
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_TEMPLATE_FIELDS.pedidos.map((field) => (
              <div key={field} className="space-y-1">
                <Label>{FIELD_LABELS[field] ?? field}</Label>
                <Select
                  value={mapping[field] ?? "__none__"}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [field]: !v || v === "__none__" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Não mapear">
                      {() => (mapping[field] ? mapping[field] : "— não mapear —")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— não mapear —</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {previewRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Pré-visualização</CardTitle>
            <CardDescription>Primeiras {previewRows.length} linha(s) mapeadas.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {IMPORT_TEMPLATE_FIELDS.pedidos.map((f) => (
                    <TableHead key={f} className="whitespace-nowrap">
                      {FIELD_LABELS[f] ?? f}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, i) => (
                  <TableRow key={i}>
                    {IMPORT_TEMPLATE_FIELDS.pedidos.map((f) => (
                      <TableCell key={f} className="whitespace-nowrap text-xs">
                        {row[f] || "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="flex items-center gap-3">
          <Button onClick={handleImport} disabled={importing || missingRequiredFields.length > 0}>
            {importing ? "Importando..." : `Importar ${rows.length} linha(s)`}
          </Button>
          {missingRequiredFields.length > 0 && (
            <p className="text-sm text-destructive">
              Mapeie os campos obrigatórios antes de importar.
            </p>
          )}
          {result && !result.error && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="default">{result.rowsImported} importada(s)</Badge>
              {result.rowsFailed > 0 && <Badge variant="destructive">{result.rowsFailed} com erro</Badge>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
