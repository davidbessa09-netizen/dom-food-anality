"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loginSchema } from "@/lib/validations/auth";
import { resolveLoginEmail, isViewerOnlyRoles } from "@/lib/auth/username";
import type { UserRole } from "@/types/database";

export interface LoginState {
  error?: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/** Genérico de propósito — nunca revela se o usuário existe, se está
 * inativo, ou se só a senha estava errada (evita enumeração de usuários). */
const GENERIC_LOGIN_ERROR = "Usuário/e-mail ou senha incorretos.";

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const identifier = parsed.data.identifier.trim();
  const isUsernameLogin = !identifier.includes("@");
  const email = resolveLoginEmail(identifier);
  const service = createServiceClient();

  // Checagem de bloqueio/status só se aplica a login por nome de usuário
  // (perfis restritos) — feita com a service role porque, antes de
  // autenticar, o cliente ainda não tem sessão pra RLS liberar a leitura.
  if (isUsernameLogin) {
    const { data: profile } = await service
      .from("user_profiles")
      .select("status, failed_login_count, locked_until")
      .eq("username", identifier.toLowerCase())
      .maybeSingle();

    if (profile) {
      if (profile.status === "inativo") return { error: GENERIC_LOGIN_ERROR };
      if (profile.locked_until && new Date(profile.locked_until).getTime() > Date.now()) {
        return { error: `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.` };
      }
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });

  if (error) {
    if (isUsernameLogin) {
      const { data: profile } = await service
        .from("user_profiles")
        .select("user_id, failed_login_count")
        .eq("username", identifier.toLowerCase())
        .maybeSingle();
      if (profile) {
        const nextCount = profile.failed_login_count + 1;
        await service
          .from("user_profiles")
          .update({
            failed_login_count: nextCount,
            locked_until: nextCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null,
          })
          .eq("user_id", profile.user_id);
      }
    }
    return { error: GENERIC_LOGIN_ERROR };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    if (isUsernameLogin) {
      await service
        .from("user_profiles")
        .update({ failed_login_count: 0, locked_until: null, last_login_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    const { data: memberships } = await supabase.from("user_organizations").select("role, organization_id").eq("user_id", user.id);
    const roles = (memberships ?? []).map((m) => m.role as UserRole);
    const orgId = memberships?.[0]?.organization_id ?? null;

    await service.from("audit_logs").insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: "login",
      entity_type: "user",
      entity_id: user.id,
      metadata: { via: isUsernameLogin ? "username" : "email" },
    });

    if (isViewerOnlyRoles(roles)) {
      redirect("/produtos-vendidos");
    }
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const service = createServiceClient();
    const { data: memberships } = await supabase.from("user_organizations").select("organization_id").eq("user_id", user.id).limit(1);
    await service.from("audit_logs").insert({
      organization_id: memberships?.[0]?.organization_id ?? null,
      actor_user_id: user.id,
      action: "logout",
      entity_type: "user",
      entity_id: user.id,
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}
