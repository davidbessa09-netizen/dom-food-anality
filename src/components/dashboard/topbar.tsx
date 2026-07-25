"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { findActiveNavItem, getVisibleNavGroups } from "./nav-items";
import { logout } from "@/app/login/actions";
import { RefreshCw, Bell, HelpCircle, LogOut, ChevronRight } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin_geral: "Administrador geral",
  gestor_marca: "Gestor de marca",
  gestor_loja: "Gestor de loja",
  analista: "Analista",
  somente_leitura: "Somente leitura",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca sincronizado";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

export function Topbar({
  isAdmin,
  email,
  role,
  organizations,
  lastSyncedAt,
  alertsCount,
}: {
  isAdmin: boolean;
  email: string;
  role: string | undefined;
  organizations: { id: string; name: string }[];
  lastSyncedAt: string | null;
  alertsCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const groups = getVisibleNavGroups(isAdmin);
  const activeItem = findActiveNavItem(pathname, groups);

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b bg-background px-4">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav groups={groups} />
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
          <span className="text-muted-foreground">DOM Food Analytics</span>
          {activeItem && (
            <>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{activeItem.label}</span>
            </>
          )}
        </nav>
        {organizations.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="ml-2" />}
            >
              {organizations[0]?.name ?? "Organização"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {organizations.map((org) => (
                <DropdownMenuItem key={org.id}>{org.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          organizations[0] && (
            <Badge variant="outline" className="ml-2 hidden sm:inline-flex">
              {organizations[0].name}
            </Badge>
          )
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground md:inline">
          Atualizado {timeAgo(lastSyncedAt)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Atualizar dados da página"
          onClick={() => router.refresh()}
        >
          <RefreshCw className="size-4" />
        </Button>

        <div className="hidden sm:block">
          <CommandPalette groups={groups} />
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Notificações"
          nativeButton={false}
          render={<a href="/alertas" />}
        >
          <span className="relative">
            <Bell className="size-4" />
            {alertsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] text-danger-foreground">
                {alertsCount > 9 ? "9+" : alertsCount}
              </span>
            )}
          </span>
        </Button>

        <Popover>
          <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Ajuda" />}>
            <HelpCircle className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end">
            <p className="font-medium">Atalhos</p>
            <p className="text-xs text-muted-foreground">
              <kbd className="rounded border bg-muted px-1">Ctrl K</kbd> abre a busca de páginas.
            </p>
            <p className="text-xs text-muted-foreground">
              Dúvidas ou problemas: fale com quem administra sua conta.
            </p>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" />}
          >
            <span className="max-w-32 truncate">{email}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
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
      </div>
    </header>
  );
}
