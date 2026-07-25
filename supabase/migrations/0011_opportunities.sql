-- Painel de Inteligência e Oportunidades (/recomendacoes) — as recomendações
-- deixam de ser recalculadas do zero a cada carregamento (perdendo status,
-- responsável, notas) e passam a ser persistidas com um ciclo de vida real.
-- `rule_key` é a chave natural que o motor de regras usa pra fazer upsert:
-- reexecutar as regras atualiza evidência/score de uma oportunidade já
-- existente sem apagar seu status/responsável/notas/histórico.

create type opportunity_priority as enum ('critica', 'alta', 'media', 'baixa');
create type opportunity_origin as enum ('regra_deterministica', 'modelo_estatistico', 'tendencia_historica');
create type opportunity_status as enum ('nova', 'em_andamento', 'concluida', 'ignorada', 'arquivada');

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  rule_key text not null, -- ex.: 'queda_faturamento', 'produto_sem_venda:<product_id>'
  category text not null, -- receita | produtos | clientes | operacao | qualidade_dados
  subcategory text not null,
  title text not null,
  description text not null,
  priority opportunity_priority not null,
  origin_type opportunity_origin not null,
  origin_explanation text not null,
  evidence jsonb not null default '[]'::jsonb, -- array de {label, value}
  affected_brands text[] not null default '{}',
  expected_impact text[] not null default '{}',
  suggested_action text not null,
  score int not null check (score between 0 and 100),
  score_explanation text not null,
  dashboard_link text,
  status opportunity_status not null default 'nova',
  assignee_user_id uuid references auth.users(id) on delete set null,
  due_date date,
  first_detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, brand_id, rule_key)
);

create index opportunities_org_idx on opportunities(organization_id);
create index opportunities_status_idx on opportunities(status);

create table opportunity_notes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create table opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  event_type text not null, -- created | viewed | status_changed | note_added | assigned | due_date_set
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table opportunities enable row level security;
alter table opportunity_notes enable row level security;
alter table opportunity_events enable row level security;

create policy opportunities_select on opportunities for select
  using (public.user_has_org_access(organization_id));

create policy opportunities_write on opportunities for all
  using (public.user_can_write_org(organization_id))
  with check (public.user_can_write_org(organization_id));

create policy opportunity_notes_select on opportunity_notes for select
  using (exists (
    select 1 from opportunities o where o.id = opportunity_notes.opportunity_id
    and public.user_has_org_access(o.organization_id)
  ));

create policy opportunity_notes_write on opportunity_notes for all
  using (exists (
    select 1 from opportunities o where o.id = opportunity_notes.opportunity_id
    and public.user_can_write_org(o.organization_id)
  ))
  with check (exists (
    select 1 from opportunities o where o.id = opportunity_notes.opportunity_id
    and public.user_can_write_org(o.organization_id)
  ));

create policy opportunity_events_select on opportunity_events for select
  using (exists (
    select 1 from opportunities o where o.id = opportunity_events.opportunity_id
    and public.user_has_org_access(o.organization_id)
  ));

create policy opportunity_events_write on opportunity_events for all
  using (exists (
    select 1 from opportunities o where o.id = opportunity_events.opportunity_id
    and public.user_can_write_org(o.organization_id)
  ))
  with check (exists (
    select 1 from opportunities o where o.id = opportunity_events.opportunity_id
    and public.user_can_write_org(o.organization_id)
  ));
