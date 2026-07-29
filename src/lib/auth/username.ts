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

/**
 * Verdadeiro quando TODOS os vínculos do usuário são "products_viewer" —
 * usado pro bloqueio de rota: esse usuário só pode acessar Produtos
 * vendidos, nunca nenhuma página administrativa, mesmo tentando pela URL
 * direto (ver middleware).
 */
export function isViewerOnlyRoles(roles: UserRole[]): boolean {
  return roles.length > 0 && roles.every((r) => r === "products_viewer");
}
