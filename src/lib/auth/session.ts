import { createClient } from "@/lib/supabase/server";
import type { UserOrganization } from "@/types/database";

export interface CurrentUser {
  id: string;
  email: string | null;
  memberships: UserOrganization[];
}

/**
 * Carrega o usuário logado e todos os seus vínculos de organização/marca/loja.
 * RLS já impede vazamento entre organizações; isso só monta o objeto de sessão
 * usado pela UI (ex.: para decidir quais itens de menu mostrar).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: memberships } = await supabase
    .from("user_organizations")
    .select("*")
    .eq("user_id", user.id);

  return {
    id: user.id,
    email: user.email ?? null,
    memberships: memberships ?? [],
  };
}

export function hasWriteAccess(role: UserOrganization["role"]) {
  return role === "admin_geral" || role === "gestor_marca" || role === "gestor_loja";
}
