-- Agenda os dois jobs de sincronização automática via pg_cron + pg_net.
--
-- IMPORTANTE — rode isto SÓ DEPOIS de:
-- 1. Fazer deploy da Edge Function "sync-orders-items" (supabase/functions/sync-orders-items).
-- 2. Cadastrar o segredo no Supabase Vault (Dashboard > Project Settings >
--    Vault > New secret), NUNCA aqui no SQL:
--    nome: sync_internal_token
--    valor: o MESMO valor da variável de ambiente CRON_SECRET já configurada
--           no Vercel (ver .env.local) — a Edge Function usa esse valor pra
--           se autenticar na rota /api/cron/sync do próprio app.
-- 3. Confirmar a URL pública do projeto Supabase (substitua
--    SEU-PROJETO abaixo pela referência real, ex.: abcdefghijk).
--
-- Nenhum segredo fica gravado neste arquivo — só a REFERÊNCIA ao nome do
-- segredo no Vault (vault.decrypted_secrets), que só é resolvida em tempo
-- de execução dentro do banco.

select cron.schedule(
  'dom-food-sync-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/sync-orders-items',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_internal_token')
    ),
    body := jsonb_build_object('trigger_type', 'scheduled')
  );
  $$
);

-- Reconciliação noturna — reprocessa os últimos 7 dias uma vez por dia
-- (03:15 no fuso America/Sao_Paulo = 06:15 UTC), corrigindo cancelamentos/
-- estornos/divergências sem duplicar nada (mesmo upsert idempotente).
select cron.schedule(
  'dom-food-sync-nightly-reconciliation',
  '15 6 * * *',
  $$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/sync-orders-items',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_internal_token')
    ),
    body := jsonb_build_object('trigger_type', 'reconciliation')
  );
  $$
);

-- Pra conferir os jobs agendados: select * from cron.job;
-- Pra ver o histórico de execução do pg_cron em si (separado de sync_runs):
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Pra remover um job: select cron.unschedule('dom-food-sync-every-5-minutes');
