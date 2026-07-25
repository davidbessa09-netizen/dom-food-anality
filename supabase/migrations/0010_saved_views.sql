-- Suporte a "Salvar visão" no sistema global de filtros: cada usuário pode
-- salvar uma combinação de filtros (marca, loja, período, etc.) por página
-- pra reaplicar depois. Dado pessoal do usuário (não de negócio), por isso
-- escopado só a quem criou — nem outros usuários da mesma organização veem.

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null, -- ex.: "/produtos" — a visão só faz sentido nessa página
  name text not null,
  params jsonb not null, -- query params serializados (brand, period, stores, ...)
  created_at timestamptz not null default now()
);

alter table saved_views enable row level security;

create policy saved_views_select on saved_views for select
  using (user_id = auth.uid());

create policy saved_views_write on saved_views for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
