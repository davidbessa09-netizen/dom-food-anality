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
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Grupo "Administração" só entra na lista se o papel do usuário permitir
 * (ver getVisibleNavGroups) — mas isso é só UX: a proteção real de acesso
 * é RLS no banco, essas rotas nunca dependem só de esconder o link aqui. */
const ALL_NAV_GROUPS: NavGroup[] = [
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

/** Toda aba/módulo controlável pelo perfil "Colaborador" (ver
 * user_module_access) — chave = href sem a barra inicial, na mesma ordem
 * exibida no menu. Fonte única de verdade: deriva de ALL_NAV_GROUPS, então
 * qualquer item de menu novo já aparece automaticamente na lista de
 * permissões do formulário de novo usuário. */
export interface ModuleOption {
  key: string;
  label: string;
  groupLabel: string;
}

export function getAllModuleOptions(): ModuleOption[] {
  return ALL_NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ key: item.href.slice(1), label: item.label, groupLabel: g.label })));
}

/** UX only — esconde o grupo Administração de quem não é admin_geral, e
 * reduz o menu inteiro a só "Vendas" pro Visualizador de vendas (papel
 * viewer-only, ver middleware). Nunca é a barreira de segurança real:
 * RLS e as checagens de role no servidor continuam sendo a proteção de
 * verdade (ver SECURITY.md) — o middleware já bloqueia qualquer outra
 * rota mesmo que este filtro de UI falhe ou seja contornado.
 *
 * `colaboradorModules` (quando não-nulo) restringe o menu só às abas
 * liberadas pra esse Colaborador (ver user_module_access) — mesma lógica
 * de "UX only", o middleware bloqueia a rota de verdade. */
export function getVisibleNavGroups(isAdmin: boolean, vendasViewerOnly = false, colaboradorModules: string[] | null = null): NavGroup[] {
  if (vendasViewerOnly) {
    return [{ label: "Vendas", items: [{ href: "/vendas", label: "Vendas", icon: ShoppingCart }] }];
  }
  if (colaboradorModules) {
    const allowed = new Set(colaboradorModules);
    return ALL_NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((item) => allowed.has(item.href.slice(1))) })).filter(
      (g) => g.items.length > 0
    );
  }
  if (isAdmin) return ALL_NAV_GROUPS;
  return ALL_NAV_GROUPS.filter((g) => g.label !== "Administração");
}

export function findActiveGroupLabel(pathname: string, groups: NavGroup[]): string | null {
  for (const group of groups) {
    if (group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))) {
      return group.label;
    }
  }
  return null;
}

export function findActiveNavItem(pathname: string, groups: NavGroup[]): NavItem | null {
  for (const group of groups) {
    const match = group.items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (match) return match;
  }
  return null;
}
