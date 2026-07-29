-- Sincronização automática a cada 5 minutos (Supabase Cron, não depende de
-- Vercel/GitHub Actions nem de navegador aberto). Arquitetura:
--   pg_cron (*/5 * * * *) -> pg_net http_post -> Supabase Edge Function
--   sync-orders-items -> chama a rota já testada /api/cron/sync do próprio
--   app (Node, com o adapter da Anota AI e o upsert idempotente já
--   existentes) -> orders/order_items -> Realtime -> telas conectadas.
--
-- Por que a Edge Function delega pro /api/cron/sync em vez de reimplementar
-- o adapter da Anota AI em Deno: a lógica de sincronização (paginação,
-- descriptografia de credencial, upsert idempotente) já existe, testada,
-- em Node/TypeScript. Duplicá-la em Deno seria um segundo lugar pra manter
-- e não pôde ser testado neste ambiente (sem Docker/Supabase CLI
-- disponíveis). A Edge Function funciona como o "despertador" confiável
-- que roda mesmo sem navegador/site aberto — o processamento pesado
-- continua na rota Node já validada.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- Lock de execução — impede duas sincronizações rodando ao mesmo tempo
-- (agendada, manual ou retentativa). Registro de controle com expiração
-- (em vez de advisory lock de sessão) porque tanto a Edge Function quanto
-- a rota Node acessam o banco via conexões stateless (PostgREST/HTTP), que
-- não preservam uma sessão Postgres entre chamadas — advisory lock exigiria
-- uma conexão persistente que este desenho não tem.
-- ---------------------------------------------------------------------
create table sync_lock (
  job_name text primary key,
  locked_at timestamptz not null,
  locked_by text not null,
  expires_at timestamptz not null
);

alter table sync_lock enable row level security;
-- Sem policy de select/insert pro cliente comum — só a service role
-- (usada pela rota /api/cron/sync e pela Server Action de sync manual)
-- acessa esta tabela.

create or replace function try_acquire_sync_lock(p_job_name text, p_owner text, p_ttl_seconds int default 240)
returns boolean
language plpgsql
security definer
as $$
declare
  did_acquire boolean := false;
begin
  insert into sync_lock (job_name, locked_at, locked_by, expires_at)
  values (p_job_name, now(), p_owner, now() + (p_ttl_seconds || ' seconds')::interval)
  on conflict (job_name) do update
    set locked_at = excluded.locked_at,
        locked_by = excluded.locked_by,
        expires_at = excluded.expires_at
    where sync_lock.expires_at < now()
  returning true into did_acquire;

  return coalesce(did_acquire, false);
end;
$$;

create or replace function release_sync_lock(p_job_name text, p_owner text)
returns void
language sql
security definer
as $$
  update sync_lock set expires_at = now() - interval '1 second'
  where job_name = p_job_name and locked_by = p_owner;
$$;

-- ---------------------------------------------------------------------
-- sync_runs — histórico da execução INTEIRA (todas as lojas de uma
-- chamada), nível macro. sync_jobs (já existente) continua guardando o
-- detalhe POR loja/integração dentro de cada execução — não foi renomeada
-- nem alterada, pra não quebrar a página de Integrações que já lê dela.
-- ---------------------------------------------------------------------
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('scheduled', 'manual', 'retry', 'reconciliation')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial_success', 'failed', 'skipped_locked')),
  stores_total int not null default 0,
  stores_success int not null default 0,
  stores_failed int not null default 0,
  orders_received int not null default 0,
  orders_inserted int not null default 0,
  orders_updated int not null default 0,
  items_received int not null default 0,
  items_inserted int not null default 0,
  items_updated int not null default 0,
  items_failed int not null default 0,
  error_message text,
  duration_ms int,
  created_at timestamptz not null default now()
);

alter table sync_runs enable row level security;

-- Qualquer usuário autenticado com acesso administrativo (mesma regra de
-- escrita usada em integrações) pode ver o histórico de execuções —
-- nenhum dado sensível (token/senha) é gravado aqui.
create policy sync_runs_select on sync_runs for select
  using (
    exists (
      select 1 from user_organizations uo
      where uo.user_id = auth.uid() and uo.role in ('admin_geral', 'gestor_marca', 'gestor_loja')
    )
  );
-- Escrita só via service role (rota /api/cron/sync), sem policy de insert/update pro cliente comum.

create index idx_sync_runs_started_at on sync_runs (started_at desc);

-- ---------------------------------------------------------------------
-- Colunas extras em integrations — "última tentativa" (mesmo que tenha
-- falhado) e "última venda sincronizada" separadas de last_synced_at
-- (que já significa "último SUCESSO", ver src/lib/integrations/anota-ai/sync.ts).
-- ---------------------------------------------------------------------
alter table integrations add column if not exists last_sync_started_at timestamptz;
alter table integrations add column if not exists last_order_synced_at timestamptz;
