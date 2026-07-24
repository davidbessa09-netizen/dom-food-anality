import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncAnotaAiIntegration } from "@/lib/integrations/anota-ai/sync";

/**
 * Sincronização automática de todas as integrações ativas. Chamado por um
 * scheduler externo (Vercel Cron, Supabase pg_cron, ou uma tarefa agendada
 * local em desenvolvimento) — nunca pelo navegador do usuário.
 *
 * Protegido por CRON_SECRET: sem o header correto, retorna 401. Roda com a
 * service role key (ignora RLS), pois não há sessão de usuário em um job de
 * CRON — por isso precisa filtrar explicitamente por integração ativa em vez
 * de depender de RLS.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado no servidor." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: integrations, error } = await supabase
    .from("integrations")
    .select("id, platform")
    .eq("platform", "anota_ai")
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const integration of integrations ?? []) {
    const result = await syncAnotaAiIntegration(supabase, integration.id, "scheduled");
    results.push(result);
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    integrationsProcessed: results.length,
    results,
  });
}
