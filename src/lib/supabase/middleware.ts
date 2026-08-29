import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getViewerAllowedPath, isViewerOnlyRoles } from "@/lib/auth/username";
import type { UserRole } from "@/types/database";

const PUBLIC_PATHS = ["/login", "/recuperar-senha", "/onboarding"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  // Rotas de API (webhooks, cron) usam autenticação própria por segredo, não
  // sessão de usuário — nunca devem ser redirecionadas para /login.
  const isApiRoute = path.startsWith("/api/");

  if (!user && !isPublic && !isApiRoute && path !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Bloqueio real de rota pros perfis "viewer-only" (Visualizador de
  // produtos, Visualizador de vendas) — não basta esconder o menu, a
  // barreira de verdade é aqui (roda em TODO request, inclusive digitando
  // a URL direto) e no RLS do banco. Um usuário com QUALQUER outro papel
  // além de um viewer-only não é restrito por esta regra (ex.: admin
  // também vinculado como viewer em outra loja continua vendo tudo que
  // seu outro papel permite).
  if (user && !isPublic && !isApiRoute) {
    const { data: memberships } = await supabase.from("user_organizations").select("role").eq("user_id", user.id);
    const roles = (memberships ?? []).map((m) => m.role as UserRole);
    const viewerOnly = isViewerOnlyRoles(roles);

    if (viewerOnly) {
      // Revogação imediata: se o administrador desativou o acesso ou ele
      // expirou, a sessão já autenticada (JWT ainda válido) é encerrada no
      // próximo request, sem esperar o token expirar sozinho.
      const { data: profile } = await supabase.from("user_profiles").select("status, expires_at").eq("user_id", user.id).maybeSingle();
      const expired = Boolean(profile?.expires_at && new Date(profile.expires_at).getTime() < Date.now());
      if (profile?.status === "inativo" || expired) {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      }

      const allowedPath = getViewerAllowedPath(roles);
      if (!path.startsWith(allowedPath)) {
        const url = request.nextUrl.clone();
        url.pathname = allowedPath;
        url.searchParams.set("blocked", "1");
        return NextResponse.redirect(url);
      }
    }

    // Bloqueio real de rota pro perfil "Colaborador": só pode abrir as
    // abas liberadas em user_module_access (ver 0022_colaborador_module_
    // access.sql) — igual ao bloqueio viewer-only acima, roda em todo
    // request e nunca depende só do menu estar filtrado na UI.
    if (roles.length > 0 && roles.every((r) => r === "colaborador")) {
      const { data: profile } = await supabase.from("user_profiles").select("status, expires_at").eq("user_id", user.id).maybeSingle();
      const expired = Boolean(profile?.expires_at && new Date(profile.expires_at).getTime() < Date.now());
      if (profile?.status === "inativo" || expired) {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
      }

      const { data: moduleRows } = await supabase.from("user_module_access").select("module").eq("user_id", user.id);
      const allowedModules = new Set((moduleRows ?? []).map((m) => m.module));
      const currentModule = path.split("/").filter(Boolean)[0] ?? "";

      if (!allowedModules.has(currentModule)) {
        const firstAllowed = allowedModules.values().next().value;
        const url = request.nextUrl.clone();
        url.pathname = firstAllowed ? `/${firstAllowed}` : "/login";
        url.searchParams.set("blocked", "1");
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
