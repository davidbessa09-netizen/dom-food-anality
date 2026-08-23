import type { UserRole } from "@/types/database";

/** Domínio interno pro e-mail sintético do Supabase Auth — nunca exibido na
 * interface, existe só porque o Supabase Auth exige um identificador de
 * e-mail internamente. O usuário sempre entra só com usuário + senha. */
const SYNTHETIC_EMAIL_DOMAIN = "users.dom-food-analytics.internal";

/** Nome de usuário -> e-mail sintético determinístico (sem round-trip ao
 * banco pra descobrir o e-mail real de login). */
export function usernameToSyntheticEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  return `${normalized}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/** Resolve o identificador de login (campo único do formulário) pro e-mail
 * que deve ser enviado ao Supabase Auth — e-mail real de administradores/
 * equipe continua funcionando como está; qualquer texto sem "@" é tratado
 * como nome de usuário e vira e-mail sintético. */
export function resolveLoginEmail(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return usernameToSyntheticEmail(trimmed);
}

/** Papéis "somente uma página" e a rota que cada um pode acessar — ver
 * bloqueio de rota no middleware. Cada papel novo desse tipo (visualizador
 * restrito a uma única tela) só precisa de uma entrada aqui. */
const VIEWER_ONLY_ROLES: Partial<Record<UserRole, string>> = {
  products_viewer: "/produtos-vendidos",
  vendas_viewer: "/vendas",
};

/**
 * Verdadeiro quando TODOS os vínculos do usuário são de um papel
 * "somente uma página" (ver VIEWER_ONLY_ROLES) — usado pro bloqueio de
 * rota: esse usuário só pode acessar a página correspondente, nunca
 * nenhuma outra (administrativa ou não), mesmo tentando pela URL direto
 * (ver middleware). Um usuário com vínculos de MAIS de um papel viewer-only
 * diferente (ex.: products_viewer numa loja e vendas_viewer noutra) não é
 * tratado como viewer-only — esse caso não é suportado hoje.
 */
export function isViewerOnlyRoles(roles: UserRole[]): boolean {
  return roles.length > 0 && roles.every((r) => r in VIEWER_ONLY_ROLES) && new Set(roles).size === 1;
}

/** Rota permitida pro papel viewer-only do usuário — chamar só depois de
 * confirmar isViewerOnlyRoles(roles) === true. */
export function getViewerAllowedPath(roles: UserRole[]): string {
  const role = roles[0];
  return (role && VIEWER_ONLY_ROLES[role]) ?? "/login";
}
