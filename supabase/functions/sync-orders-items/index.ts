// Supabase Edge Function (Deno) — gatilho fino do sincronizador de pedidos.
//
// Por quê um gatilho fino em vez de reimplementar a sincronização aqui:
// toda a lógica real (busca no Anota AI, dedup, retentativa, lock,
// sync_runs, etc.) já existe, testada, em Node/TypeScript na rota
// `/api/cron/sync` do app Next.js (ver src/app/api/cron/sync/route.ts e
// src/lib/integrations/). Reescrever essa lógica em Deno duplicaria o
// código e não poderia ser testada neste ambiente de desenvolvimento (sem
// Docker/Supabase CLI disponíveis para `supabase functions serve`).
// Em vez disso, esta função só repassa a chamada HTTP — quem decide
// tudo (lock, sync_runs, retentativa) continua sendo o código já testado.
//
// Configuração necessária (ver migration 0016_schedule_sync_cron.sql):
//  - Variável de ambiente da função: APP_SYNC_URL (ex.: https://seu-app.vercel.app/api/cron/sync)
//  - Segredo do Supabase Vault: sync_internal_token — MESMO valor de CRON_SECRET
//    do app Next.js. Nunca colocar o valor real em código ou SQL.
//
// Deploy (o usuário deve rodar isso — este ambiente não tem Supabase CLI):
//   supabase functions deploy sync-orders-items
//   supabase secrets set APP_SYNC_URL=https://seu-app.vercel.app/api/cron/sync

Deno.serve(async (req: Request) => {
  const appSyncUrl = Deno.env.get("APP_SYNC_URL");
  const internalToken = Deno.env.get("SYNC_INTERNAL_TOKEN");

  if (!appSyncUrl || !internalToken) {
    return new Response(
      JSON.stringify({ error: "APP_SYNC_URL ou SYNC_INTERNAL_TOKEN não configurados na função." }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  let triggerType = "scheduled";
  try {
    const body = await req.json();
    if (body?.trigger_type) triggerType = body.trigger_type;
  } catch {
    // corpo ausente — usa "scheduled" como padrão (chamada do cron de 5min).
  }

  try {
    const response = await fetch(appSyncUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify({ trigger_type: triggerType }),
    });

    const payload = await response.text();
    return new Response(payload, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao chamar o app.";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
});
