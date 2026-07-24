"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Store,
  ShoppingCart,
  Package,
  Route,
  Users,
  Layers,
  Combine,
  Ban,
  Bell,
  Sparkles,
  MapPinned,
  Plug,
  Upload,
  GitMerge,
  ShieldCheck,
  History,
  Settings,
  UserCog,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Visão geral",
    items: [
      { href: "/dashboard", label: "Dashboard executivo", icon: LayoutDashboard },
      { href: "/lojas", label: "Comparação de lojas", icon: Store },
    ],
  },
  {
    label: "Análise",
    items: [
      { href: "/vendas", label: "Vendas", icon: ShoppingCart },
      { href: "/produtos", label: "Produtos", icon: Package },
      { href: "/jornada", label: "Jornada do cliente", icon: Route },
      { href: "/clientes", label: "Clientes e RFM", icon: Users },
      { href: "/categorias", label: "Categorias", icon: Layers },
      { href: "/combos", label: "Combos e associações", icon: Combine },
      { href: "/cancelamentos", label: "Cancelamentos", icon: Ban },
      { href: "/bairros", label: "Bairros e regiões", icon: MapPinned },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { href: "/alertas", label: "Alertas", icon: Bell },
      { href: "/recomendacoes", label: "Recomendações", icon: Sparkles },
    ],
  },
  {
    label: "Dados",
    items: [
      { href: "/integracoes", label: "Integrações", icon: Plug },
      { href: "/importacoes", label: "Importações", icon: Upload },
      { href: "/correspondencia-produtos", label: "Correspondência de produtos", icon: GitMerge },
      { href: "/qualidade-dados", label: "Qualidade dos dados", icon: ShieldCheck },
      { href: "/sincronizacoes", label: "Histórico de sincronizações", icon: History },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/configuracoes", label: "Configurações", icon: Settings },
      { href: "/usuarios", label: "Usuários e permissões", icon: UserCog },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center justify-between px-3 py-4">
        {!collapsed && <span className="truncate font-semibold">DOM Food Analytics</span>}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </Button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                      title={collapsed ? label : undefined}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
