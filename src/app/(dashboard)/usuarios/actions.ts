"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/auth/session";
import { usernameToSyntheticEmail } from "@/lib/auth/username";
import type { UserRole } from "@/types/database";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Toda action aqui exige admin_geral — verificado no servidor a cada
 * chamada (nunca confia só em o menu estar escondido no cliente). Retorna
 * o organization_id do admin logado (usado pra escopar o novo vínculo). */
async function requireAdmin(): Promise<{ userId: string; organizationId: string } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const membership = user.memberships.find((m) => m.role === "admin_geral");
  if (!membership) return null;
  return { userId: user.id, organizationId: membership.organization_id };
}

async function logAudit(organizationId: string, actorUserId: string, action: string, entityId: string, metadata?: Record<string, unknown>) {
  const service = createServiceClient();
  await service.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: actorUserId,
    action,
    entity_type: "user",
    entity_id: entityId,
    metadata: metadata ?? null,
  });
}

export interface CreateProductsViewerInput {
  displayName: string;
  username: string;
  password: string;
  role: "products_viewer" | "vendas_viewer" | "admin_geral";
  storeIds: string[]; // vazio = todas as lojas da organização (ignorado pra vendas_viewer/admin_geral)
  mustChangePassword: boolean;
  expiresAt: string | null;
  note: string | null;
}

/**
 * Cria um usuário SEM e-mail na interface (e-mail sintético interno só pro
 * Supabase Auth aceitar) — perfil "Visualizador de produtos" (restrito por
 * loja), "Visualizador de vendas" (sempre organização inteira, sem escopo
 * por loja) ou "Administrador geral" (acesso completo, aviso obrigatório na
 * UI antes de salvar). Usa a service role (bypassa RLS) porque criar
 * usuário em auth.users exige privilégio administrativo que o cliente
 * autenticado normal não tem.
 */
export async function createProductsViewerUser(input: CreateProductsViewerInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Apenas administradores podem criar acessos." };

  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { ok: false, error: "Nome de usuário deve ter 3 a 32 caracteres (letras, números, ponto, traço ou underline)." };
  }
  if (input.password.length < 8) return { ok: false, error: "A senha temporária deve ter ao menos 8 caracteres." };
  if (!input.displayName.trim()) return { ok: false, error: "Informe o nome da pessoa." };

  const service = createServiceClient();

  const { data: existing } = await service.from("user_profiles").select("user_id").eq("username", username).maybeSingle();
  if (existing) return { ok: false, error: "Esse nome de usuário já existe." };

  const email = usernameToSyntheticEmail(username);
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { ok: false, error: createError?.message ?? "Falha ao criar o usuário." };
  }

  const newUserId = created.user.id;

  const { error: profileError } = await service.from("user_profiles").insert({
    user_id: newUserId,
    username,
    display_name: input.displayName.trim(),
    status: "ativo",
    must_change_password: input.mustChangePassword,
    expires_at: input.expiresAt,
    note: input.note,
    created_by: admin.userId,
  });
  if (profileError) {
    await service.auth.admin.deleteUser(newUserId);
    return { ok: false, error: "Falha ao salvar o perfil do usuário." };
  }

  if (input.role === "admin_geral") {
    const { error: adminLinkError } = await service.from("user_organizations").insert({
      user_id: newUserId,
      organization_id: admin.organizationId,
      role: "admin_geral" as UserRole,
      brand_id: null,
      store_id: null,
    });
    if (adminLinkError) {
      await service.auth.admin.deleteUser(newUserId);
      return { ok: false, error: "Falha ao conceder o acesso administrativo." };
    }
    await logAudit(admin.organizationId, admin.userId, "user_created", newUserId, { username, role: "admin_geral" });
    revalidatePath("/usuarios");
    return { ok: true };
  }

  if (input.role === "vendas_viewer") {
    // Sempre organização inteira — este papel não tem escopo por loja (ver
    // migration 0020_vendas_viewer_access.sql).
    const { error: vendasLinkError } = await service.from("user_organizations").insert({
      user_id: newUserId,
      organization_id: admin.organizationId,
      role: "vendas_viewer" as UserRole,
      brand_id: null,
      store_id: null,
    });
    if (vendasLinkError) {
      await service.auth.admin.deleteUser(newUserId);
      return { ok: false, error: "Falha ao conceder o acesso de Vendas." };
    }
    await logAudit(admin.organizationId, admin.userId, "user_created", newUserId, { username, role: "vendas_viewer" });
    revalidatePath("/usuarios");
    return { ok: true };
  }

  const storeRows: { user_id: string; organization_id: string; role: UserRole; brand_id: null; store_id: string | null }[] =
    input.storeIds.length > 0
      ? input.storeIds.map((storeId) => ({
          user_id: newUserId,
          organization_id: admin.organizationId,
          role: "products_viewer",
          brand_id: null,
          store_id: storeId,
        }))
      : [
          {
            user_id: newUserId,
            organization_id: admin.organizationId,
            role: "products_viewer",
            brand_id: null,
            store_id: null, // null = todas as lojas da organização
          },
        ];

  const { error: linkError } = await service.from("user_organizations").insert(storeRows);
  if (linkError) {
    await service.auth.admin.deleteUser(newUserId);
    return { ok: false, error: "Falha ao vincular as lojas selecionadas." };
  }

  await logAudit(admin.organizationId, admin.userId, "user_created", newUserId, {
    username,
    storeCount: input.storeIds.length || "todas",
  });

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function updateViewerStores(userId: string, storeIds: string[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Apenas administradores podem alterar acessos." };

  const service = createServiceClient();
  await service.from("user_organizations").delete().eq("user_id", userId).eq("role", "products_viewer");

  const storeRows: { user_id: string; organization_id: string; role: UserRole; brand_id: null; store_id: string | null }[] =
    storeIds.length > 0
      ? storeIds.map((storeId) => ({
          user_id: userId,
          organization_id: admin.organizationId,
          role: "products_viewer",
          brand_id: null,
          store_id: storeId,
        }))
      : [{ user_id: userId, organization_id: admin.organizationId, role: "products_viewer", brand_id: null, store_id: null }];

  const { error } = await service.from("user_organizations").insert(storeRows);
  if (error) return { ok: false, error: "Falha ao atualizar as lojas." };

  await logAudit(admin.organizationId, admin.userId, "user_stores_updated", userId, { storeCount: storeIds.length || "todas" });
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function resetViewerPassword(userId: string, newPassword: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Apenas administradores podem redefinir senha." };
  if (newPassword.length < 8) return { ok: false, error: "A senha deve ter ao menos 8 caracteres." };

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { ok: false, error: "Falha ao redefinir a senha." };

  await service.from("user_profiles").update({ must_change_password: true, failed_login_count: 0, locked_until: null }).eq("user_id", userId);
  await logAudit(admin.organizationId, admin.userId, "password_reset", userId);
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function setViewerStatus(userId: string, status: "ativo" | "inativo"): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Apenas administradores podem ativar/desativar acessos." };

  const service = createServiceClient();
  const { error } = await service.from("user_profiles").update({ status }).eq("user_id", userId);
  if (error) return { ok: false, error: "Falha ao atualizar o status." };

  await logAudit(admin.organizationId, admin.userId, status === "ativo" ? "user_activated" : "user_deactivated", userId);
  revalidatePath("/usuarios");
  return { ok: true };
}

export async function deleteViewerUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Apenas administradores podem excluir acessos." };
  if (userId === admin.userId) return { ok: false, error: "Você não pode excluir seu próprio usuário." };

  const service = createServiceClient();
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: "Falha ao excluir o usuário." };

  await logAudit(admin.organizationId, admin.userId, "user_deleted", userId);
  revalidatePath("/usuarios");
  return { ok: true };
}

export interface ViewerUserRow {
  userId: string;
  displayName: string;
  username: string;
  status: "ativo" | "inativo";
  storeNames: string[];
  allStores: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export async function listProductsViewerUsers(): Promise<ViewerUserRow[]> {
  return listViewerUsersByRole("products_viewer");
}

export async function listVendasViewerUsers(): Promise<ViewerUserRow[]> {
  return listViewerUsersByRole("vendas_viewer");
}

async function listViewerUsersByRole(role: "products_viewer" | "vendas_viewer"): Promise<ViewerUserRow[]> {
  const admin = await requireAdmin();
  if (!admin) return [];

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("user_organizations")
    .select("user_id, store_id, stores(name)")
    .eq("organization_id", admin.organizationId)
    .eq("role", role);

  const service = createServiceClient();
  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  if (userIds.length === 0) return [];

  const { data: profiles } = await service.from("user_profiles").select("*").in("user_id", userIds);

  interface MembershipRow {
    user_id: string;
    store_id: string | null;
    stores: { name: string } | { name: string }[] | null;
  }
  const membershipRows = (memberships ?? []) as unknown as MembershipRow[];

  return userIds.map((userId) => {
    const profile = (profiles ?? []).find((p) => p.user_id === userId);
    const userMemberships = membershipRows.filter((m) => m.user_id === userId);
    const allStores = userMemberships.some((m) => m.store_id === null);
    const storeNames = allStores
      ? []
      : userMemberships.map((m) => (Array.isArray(m.stores) ? m.stores[0]?.name : m.stores?.name) ?? "—");

    return {
      userId,
      displayName: profile?.display_name ?? "—",
      username: profile?.username ?? "—",
      status: (profile?.status as "ativo" | "inativo") ?? "ativo",
      storeNames,
      allStores,
      lastLoginAt: profile?.last_login_at ?? null,
      createdAt: profile?.created_at ?? "",
    };
  });
}
