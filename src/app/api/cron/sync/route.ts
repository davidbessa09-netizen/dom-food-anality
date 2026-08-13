import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncAnotaAiIntegration } from "@/lib/integrations/anota-ai/sync";
import { syncBarFacilIntegration } from "@/lib/integrations/bar-facil/sync";
import { tryAcquireSyncLock, releaseSyncLock } from "@/lib/integrations/sync-lock";
import { computeReconciliationSince } from "@/lib/integrations/sync-window";

// Confirmado ao vivo em 2026-08-13: com 5 lojas Anota AI + Bar Fácil, uma
// execução normal já leva ~170s (dominado pela Anota AI, não pelo
// backfill do Bar Fácil). 300s é o teto do plano Pro da Vercel — dá
// margem real sem cortar execuções que já funcionavam antes desta mudança
// (NUNCA reduzir abaixo do que já era observado como duração normal).
export const maxDuration = 300;

type TriggerType = "scheduled" | "manual" | "retry" | "reconciliation";

/**
 * Sincronização automática de todas as integrações ativas. Chamado por um
 * scheduler externo (Supabase Cron -> Edge Function `sync-orders-items`,
 * ver supabase/functions/sync-orders-items e migrations 0015/0016) a cada
 * 5 minutos, e uma vez por noite em modo de reconciliação — nunca pelo
 * navegador do usuário, e continua rodando mesmo sem nenhuma página aberta.
 *
 * Protegido por CRON_SECRET: sem o header correto, retorna 401. Roda com a
 * service role key (ignora RLS), pois não há sessão de usuário em um job de
 * CRON — por isso precisa filtrar explicitamente por integração ativa em vez
 * de depender de RLS.
 *
 * Lock: antes de processar qualquer loja, tenta adquirir um lock de
 * execução (sync_lock, ver migration 0015) — se outra execução (agendada,
 * manual ou retentativa) já estiver rodando, registra "skipped_locked" e
 * retorna sem erro (aguarda o próximo ciclo).
 */
async function runSync(request: NextRequest, triggerType: TriggerType) {
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

  const lockOwner = `cron-route-${Date.now()}`;
  const acquired = await tryAcquireSyncLock(supabase, lockOwner);

  if (!acquired) {
    await supabase.from("sync_runs").insert({
      trigger_type: triggerType,
      status: "skipped_locked",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
    return NextResponse.json({ status: "skipped_locked", ranAt: new Date().toISOString() });
  }

  const startedAt = new Date();
  const { data: syncRun } = await supabase
    .from("sync_runs")
    .insert({ trigger_type: triggerType, status: "running", started_at: startedAt.toISOString() })
    .select("id")
    .single();

  try {
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("id, platform")
      .eq("platform", "anota_ai")
      .eq("is_active", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const reconciliationSince = triggerType === "reconciliation" ? computeReconciliationSince() : undefined;

    const results = [];
    let storesSuccess = 0;
    let storesFailed = 0;
    let ordersReceived = 0;

    // Sequencial de propósito — controla a concorrência contra a API de
    // origem (ver item 6 do brief) e garante que a falha de uma loja nunca
    // impede as demais (syncAnotaAiIntegration nunca lança, mas o try/catch
    // aqui é uma segunda rede de segurança contra qualquer exceção
    // inesperada fora dela).
    for (const integration of integrations ?? []) {
      try {
        const result = await syncAnotaAiIntegration(supabase, integration.id, triggerType, reconciliationSince);
        results.push(result);
        ordersReceived += result.ordersProcessed;
        if (result.ok) storesSuccess++;
        else storesFailed++;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Erro desconhecido";
        results.push({ integrationId: integration.id, ok: false, ordersProcessed: 0, error: message });
        storesFailed++;
      }
    }

    // Bar Fácil é uma integração única (não por loja) — roda depois do
    // loop da Anota AI, no mesmo ciclo de 5min, e nunca derruba o restante
    // do sync se falhar (mesmo padrão de isolamento de falha por origem).
    let barFacilResult: Awaited<ReturnType<typeof syncBarFacilIntegration>> | null = null;
    try {
      const { data: barFacilIntegration } = await supabase.from("integrations").select("id").eq("platform", "bar_facil").eq("is_active", true).maybeSingle();
      if (barFacilIntegration) {
        barFacilResult = await syncBarFacilIntegration(supabase, triggerType);
        ordersReceived += barFacilResult.ordersProcessed;
        if (barFacilResult.ok) storesSuccess += barFacilResult.eventosProcessed;
        else storesFailed += barFacilResult.errors.length || 1;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erro desconhecido";
      barFacilResult = { ok: false, eventosProcessed: 0, ordersProcessed: 0, errors: [message] };
      storesFailed++;
    }

    const finalStatus = storesFailed === 0 ? "success" : storesSuccess === 0 ? "failed" : "partial_success";

    if (syncRun) {
      await supabase
        .from("sync_runs")
        .update({
          status: finalStatus,
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt.getTime(),
          stores_total: (integrations ?? []).length + (barFacilResult ? barFacilResult.eventosProcessed : 0),
          stores_success: storesSuccess,
          stores_failed: storesFailed,
          orders_received: ordersReceived,
        })
        .eq("id", syncRun.id);
    }

    return NextResponse.json({
      ranAt: new Date().toISOString(),
      triggerType,
      integrationsProcessed: results.length,
      results,
      barFacil: barFacilResult,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    if (syncRun) {
      await supabase
        .from("sync_runs")
        .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
        .eq("id", syncRun.id);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await releaseSyncLock(supabase, lockOwner);
  }
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode");
  const triggerType: TriggerType = mode === "reconciliation" ? "reconciliation" : "scheduled";
  return runSync(request, triggerType);
}

export async function POST(request: NextRequest) {
  let triggerType: TriggerType = "scheduled";
  try {
    const body = await request.json();
    if (body?.trigger_type === "reconciliation") triggerType = "reconciliation";
    else if (body?.trigger_type === "retry") triggerType = "retry";
  } catch {
    // corpo vazio/ausente é aceitável — usa o padrão "scheduled".
  }
  return runSync(request, triggerType);
}
