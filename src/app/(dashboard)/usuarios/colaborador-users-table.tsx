"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeBR } from "@/lib/dates/format";
import { matchesSearch } from "@/lib/text/normalize";
import { ColaboradorUserActions } from "./colaborador-row-actions";
import { getAllModuleOptions } from "@/components/dashboard/nav-items";
import type { ColaboradorUserRow } from "./actions";
import { Search } from "lucide-react";

const FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

const MODULE_LABEL: Record<string, string> = Object.fromEntries(getAllModuleOptions().map((m) => [m.key, m.label]));

export function ColaboradorUsersTable({ users }: { users: ColaboradorUserRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("todos");

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (filter !== "todos" && u.status !== filter) return false;
      if (!search.trim()) return true;
      const haystack = `${u.displayName} ${u.username} ${u.modules.map((m) => MODULE_LABEL[m] ?? m).join(" ")}`;
      return matchesSearch(haystack, search);
    });
  }, [users, search, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar nome, usuário ou aba..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Abas liberadas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((v) => (
              <TableRow key={v.userId}>
                <TableCell className="font-medium">{v.displayName}</TableCell>
                <TableCell className="font-mono text-xs">{v.username}</TableCell>
                <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                  {v.modules.map((m) => MODULE_LABEL[m] ?? m).join(", ") || "—"}
                </TableCell>
                <TableCell>
                  <Badge className={v.status === "ativo" ? "bg-success" : undefined} variant={v.status === "ativo" ? "default" : "secondary"}>
                    {v.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {v.lastLoginAt ? formatDateTimeBR(v.lastLoginAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Nunca"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {v.createdAt ? formatDateTimeBR(v.createdAt, { day: "2-digit", month: "2-digit" }) : "—"}
                </TableCell>
                <TableCell>
                  <ColaboradorUserActions userId={v.userId} status={v.status} currentModules={v.modules} />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  {users.length === 0 ? "Nenhum colaborador criado ainda." : "Nenhum usuário encontrado."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
