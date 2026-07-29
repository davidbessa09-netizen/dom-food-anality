"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavContent } from "./nav-content";
import { getVisibleNavGroups } from "./nav-items";
import { logout } from "@/app/login/actions";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { BRAND } from "@/lib/brand";

const ROLE_LABELS: Record<string, string> = {
  admin_geral: "Administrador geral",
  gestor_marca: "Gestor de marca",
  gestor_loja: "Gestor de loja",
  analista: "Analista",
  somente_leitura: "Somente leitura",
};

function initials(text: string): string {
  const clean = text.trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function SidebarNav({
  organizationName,
  email,
  role,
  isAdmin,
}: {
  organizationName: string | null;
  email: string;
  role: string | undefined;
  isAdmin: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const groups = getVisibleNavGroups(isAdmin);

  return (
    <aside
      className="hidden h-screen shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200 md:flex"
      style={{ width: collapsed ? 72 : 256, minWidth: collapsed ? 72 : 256 }}
    >
      <div className={cn("flex items-center gap-2 px-3 py-4", collapsed ? "flex-col" : "justify-between")}>
        {collapsed ? (
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logoSymbolPath} alt={BRAND.logoAlt} className="size-full object-contain p-1" />
          </span>
        ) : (
          <span className="flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-md bg-black px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logoFullPath} alt={BRAND.logoAlt} className="h-full w-full object-contain" />
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </Button>
      </div>

      <NavContent groups={groups} collapsed={collapsed} />

      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-sidebar-accent",
                  collapsed && "justify-center"
                )}
              />
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initials(email)}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{organizationName ?? "—"}</span>
                <span className="block truncate text-xs text-sidebar-foreground/60">{email}</span>
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate font-medium">{email}</span>
              {role && <span className="block text-xs font-normal text-muted-foreground">{ROLE_LABELS[role] ?? role}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => logout()}>
              <LogOut className="size-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {!collapsed && (
          <p className="mt-2 px-2 text-[11px] leading-tight text-[color:var(--dom-silver)]">
            Desenvolvido por <span className="text-[color:var(--dom-gold)]">{BRAND.developer}</span>
          </p>
        )}
      </div>
    </aside>
  );
}
