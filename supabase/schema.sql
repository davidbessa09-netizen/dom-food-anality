-- =====================================================================
-- DOM Food Analytics — Schema completo (PostgreSQL / Supabase)
-- Fuso de referência para toda métrica derivada: America/Sao_Paulo
-- Este arquivo cria o modelo de dados completo (Fases 1-5). Tabelas de
-- fases futuras existem desde já para não exigir migrations quebrando
-- FKs depois, mas só passam a ser escritas quando a fase correspondente
-- for implementada.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm"; -- para similaridade de nomes de produto/bairro

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type user_role as enum ('admin_geral','gestor_marca','gestor_loja','analista','somente_leitura');
create type platform_type as enum ('anota_ai','ifood','csv_import','event_tracking');
create type sync_status as enum ('pending','running','success','partial_success','failed');
create type order_status as enum ('criado','confirmado','em_preparo','saiu_para_entrega','concluido','cancelado');
create type order_fulfillment as enum ('entrega','retirada','consumo_local');
create type data_confidence as enum ('real','calculado','estimado');
create type import_status as enum ('pendente','processando','concluido','concluido_com_erros','falhou','desfeito');
create type alert_severity as enum ('info','atencao','critico');

-- ---------------------------------------------------------------------
-- FASE 1 — FUNDAÇÃO: organizações, marcas, lojas, usuários, permissões
-- ---------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_demo boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  color_hex text, -- cor de identidade visual da marca no dashboard
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  city text,
  state text,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_channels (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  platform platform_type not null,
  external_store_id text, -- id da loja na plataforma de origem, quando existir
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, platform)
);

-- Perfis de usuário (auth.users é gerenciado pelo Supabase Auth)
create table user_organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role user_role not null default 'somente_leitura',
  brand_id uuid references brands(id) on delete cascade, -- se nulo, escopo = toda a organização
  store_id uuid references stores(id) on delete cascade, -- se nulo, escopo = toda a marca (ou org)
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, brand_id, store_id)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- FASE 3 — INTEGRAÇÕES
-- ---------------------------------------------------------------------

create table integrations (
  id uuid primary key default gen_random_uuid(),
  sales_channel_id uuid not null references sales_channels(id) on delete cascade,
  platform platform_type not null,
  connector_version text not null default '1.0.0',
  last_synced_at timestamptz,
  last_cursor text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Credenciais nunca em texto plano: guardamos apenas referência a um secret
-- gerenciado (ex.: Supabase Vault / variável de ambiente por integração),
-- nunca o valor do token/senha em coluna comum.
create table integration_credentials (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  secret_ref text, -- identificador do segredo num vault externo (futuro), quando aplicável
  encrypted_value text, -- token criptografado (AES-256-GCM) pela aplicação — caminho atual
  scopes text[],
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sync_jobs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references integrations(id) on delete cascade,
  status sync_status not null default 'pending',
  trigger text not null default 'manual', -- manual | scheduled | webhook
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_fetched int not null default 0,
  records_upserted int not null default 0,
  records_failed int not null default 0,
  attempt int not null default 1,
  next_retry_at timestamptz,
  error_summary text,
  created_at timestamptz not null default now()
);

create table sync_logs (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references sync_jobs(id) on delete cascade,
  level text not null default 'info', -- info | warning | error
  message text not null,
  source_external_id text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- FASE 2 — CATÁLOGO E PEDIDOS
-- ---------------------------------------------------------------------

create table categories (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  canonical_name text not null,
  menu_position int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Produto canônico (consolidado) para análises entre plataformas
create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  category_id uuid references categories(id),
  canonical_name text not null,
  current_price numeric(10,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Variante = como o produto aparece em uma plataforma/loja específica
-- (nome original preservado, ex.: "Combo Chef - 100P" no Anota AI)
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null, -- nulo = ainda não associado (correspondência pendente)
  sales_channel_id uuid not null references sales_channels(id) on delete cascade,
  source_external_id text not null,
  original_name text not null,
  match_status text not null default 'pendente', -- pendente | sugerido | aprovado | rejeitado
  match_confidence numeric(4,3), -- 0..1, similaridade sugerida pelo sistema
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_channel_id, source_external_id)
);

create table product_category_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  category_id uuid references categories(id),
  valid_from timestamptz not null default now(),
  valid_to timestamptz
);

create table product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  price numeric(10,2) not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text,
  phone_masked text, -- máscara para exibição (ex.: (48) 9****-1234)
  email_masked text,
  phone_hash text, -- hash para deduplicação sem expor o dado
  email_hash text,
  first_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um cliente pode aparecer com identificadores diferentes por canal
create table customer_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  sales_channel_id uuid not null references sales_channels(id) on delete cascade,
  source_external_id text not null,
  created_at timestamptz not null default now(),
  unique (sales_channel_id, source_external_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  sales_channel_id uuid not null references sales_channels(id) on delete cascade,
  customer_id uuid references customers(id), -- nulo = cliente não identificado
  source_platform platform_type not null,
  source_external_id text not null,
  status order_status not null default 'criado',
  fulfillment_type order_fulfillment not null default 'entrega',
  payment_method text,
  gross_amount numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  delivery_fee_amount numeric(10,2) not null default 0,
  net_amount numeric(10,2), -- nulo = plataforma não informa líquido
  neighborhood_raw text,
  neighborhood_id uuid, -- FK adicionada após criar neighborhoods
  ordered_at timestamptz not null,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  synced_at timestamptz not null default now(),
  source_updated_at timestamptz,
  sync_status sync_status not null default 'success',
  connector_version text not null default '1.0.0',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_channel_id, source_external_id)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  original_name text not null, -- preserva nome mesmo se variante não associada ainda
  quantity numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null default 0,
  total_price numeric(10,2) not null default 0,
  is_addon boolean not null default false,
  parent_item_id uuid references order_items(id), -- adicional vinculado a um item principal
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  method text not null,
  amount numeric(10,2) not null,
  status text not null default 'aprovado',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table discounts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  coupon_id uuid,
  amount numeric(10,2) not null,
  description text,
  created_at timestamptz not null default now()
);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  code text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (brand_id, code)
);

create table delivery_fees (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table cancellations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade unique,
  reason text, -- 'motivo não informado' quando a plataforma não fornecer
  reason_source text not null default 'nao_informado', -- plataforma | cliente | loja | nao_informado
  refunded_amount numeric(10,2) not null default 0,
  cancelled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(10,2) not null,
  reason text,
  refunded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- FASE 5 — JORNADA DO CLIENTE (eventos de navegação do cardápio próprio)
-- Só é populada onde houver rastreamento autorizado (SDK próprio).
-- ---------------------------------------------------------------------

create table menu_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  anonymous_id text not null,
  customer_id uuid references customers(id),
  device_type text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table menu_events (
  id uuid primary key default gen_random_uuid(),
  menu_session_id uuid not null references menu_sessions(id) on delete cascade,
  event_name text not null, -- menu_view, category_view, product_view, add_to_cart, checkout_start, ...
  occurred_at timestamptz not null default now(),
  store_id uuid references stores(id),
  channel_id uuid references sales_channels(id),
  category_id uuid references categories(id),
  product_id uuid references products(id),
  order_id uuid references orders(id),
  page_url text,
  referrer text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- FASE 4 — INTELIGÊNCIA COMERCIAL (alertas, recomendações, métricas diárias)
-- ---------------------------------------------------------------------

create table alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid references brands(id),
  store_id uuid references stores(id),
  rule_key text not null, -- ex.: 'queda_vendas', 'produto_sem_venda_x_dias'
  severity alert_severity not null default 'info',
  title text not null,
  description text not null,
  evidence jsonb not null, -- números/comparações que embasam o alerta
  confidence data_confidence not null default 'calculado',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  brand_id uuid references brands(id),
  store_id uuid references stores(id),
  category text not null, -- combo | reposicionamento | promocao | logistica | midia_local ...
  title text not null,
  what_happened text not null,
  period_start date not null,
  period_end date not null,
  evidence jsonb not null,
  comparison_used text,
  possible_causes text[],
  suggested_action text not null,
  confidence data_confidence not null default 'estimado',
  confidence_score numeric(4,3), -- 0..1 quando aplicável
  created_at timestamptz not null default now()
);

-- Métricas diárias pré-agregadas por loja (acelera dashboards)
create table daily_metrics (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  metric_date date not null,
  gross_revenue numeric(12,2) not null default 0,
  net_revenue numeric(12,2),
  orders_count int not null default 0,
  completed_orders_count int not null default 0,
  cancelled_orders_count int not null default 0,
  unique_customers_count int not null default 0,
  new_customers_count int not null default 0,
  returning_customers_count int not null default 0,
  discount_total numeric(12,2) not null default 0,
  delivery_fee_total numeric(12,2) not null default 0,
  computed_at timestamptz not null default now(),
  unique (store_id, metric_date)
);

-- ---------------------------------------------------------------------
-- IMPORTAÇÃO DE ARQUIVOS
-- ---------------------------------------------------------------------

create table imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  store_id uuid references stores(id),
  import_type text not null, -- pedidos | produtos | clientes | cancelamentos | cardapio | financeiro
  file_name text not null,
  status import_status not null default 'pendente',
  column_mapping jsonb,
  rows_total int not null default 0,
  rows_imported int not null default 0,
  rows_failed int not null default 0,
  created_by uuid references auth.users(id),
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table import_errors (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imports(id) on delete cascade,
  row_number int not null,
  column_name text,
  message text not null,
  raw_row jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- BAIRROS E REGIÕES
-- ---------------------------------------------------------------------

create table cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  unique (name, state)
);

create table neighborhoods (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id),
  canonical_name text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now(),
  unique (city_id, canonical_name)
);

-- Preserva a grafia original recebida da plataforma e associa ao bairro canônico
create table neighborhood_aliases (
  id uuid primary key default gen_random_uuid(),
  neighborhood_id uuid references neighborhoods(id), -- nulo = ainda não normalizado (fila de revisão)
  raw_value text not null,
  confidence numeric(4,3), -- confiança da normalização automática
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (raw_value)
);

create table postal_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  neighborhood_id uuid references neighborhoods(id),
  source text not null default 'plataforma', -- plataforma | enriquecimento_autorizado
  created_at timestamptz not null default now()
);

create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  neighborhood_id uuid not null references neighborhoods(id),
  approx_distance_km numeric(6,2),
  created_at timestamptz not null default now(),
  unique (store_id, neighborhood_id)
);

-- Métricas geográficas pré-agregadas (equivalente ao daily_metrics, por bairro)
create table geographic_metrics (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  neighborhood_id uuid not null references neighborhoods(id),
  metric_date date not null,
  orders_count int not null default 0,
  gross_revenue numeric(12,2) not null default 0,
  net_revenue numeric(12,2),
  unique_customers_count int not null default 0,
  new_customers_count int not null default 0,
  cancelled_orders_count int not null default 0,
  avg_delivery_fee numeric(10,2),
  computed_at timestamptz not null default now(),
  unique (store_id, neighborhood_id, metric_date)
);

alter table orders add constraint orders_neighborhood_fk
  foreign key (neighborhood_id) references neighborhoods(id);

-- =====================================================================
-- ÍNDICES
-- =====================================================================
create index idx_orders_store_ordered_at on orders (store_id, ordered_at desc);
create index idx_orders_customer on orders (customer_id);
create index idx_orders_neighborhood on orders (neighborhood_id);
create index idx_order_items_order on order_items (order_id);
create index idx_order_items_variant on order_items (product_variant_id);
create index idx_product_variants_product on product_variants (product_id);
create index idx_product_variants_match_status on product_variants (match_status);
create index idx_menu_events_session on menu_events (menu_session_id);
create index idx_menu_events_name_time on menu_events (event_name, occurred_at);
create index idx_daily_metrics_store_date on daily_metrics (store_id, metric_date desc);
create index idx_geo_metrics_store_date on geographic_metrics (store_id, metric_date desc);
create index idx_sync_jobs_integration on sync_jobs (integration_id, started_at desc);
create index trgm_products_name on products using gin (canonical_name gin_trgm_ops);
create index trgm_neighborhood_alias on neighborhood_aliases using gin (raw_value gin_trgm_ops);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

-- Função auxiliar: o usuário logado tem acesso a esta loja?
create or replace function public.user_has_store_access(target_store_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from user_organizations uo
    join stores s on s.id = target_store_id
    join brands b on b.id = s.brand_id
    where uo.user_id = auth.uid()
      and uo.organization_id = b.organization_id
      and (uo.brand_id is null or uo.brand_id = b.id)
      and (uo.store_id is null or uo.store_id = s.id)
  );
$$;

create or replace function public.user_has_brand_access(target_brand_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from user_organizations uo
    join brands b on b.id = target_brand_id
    where uo.user_id = auth.uid()
      and uo.organization_id = b.organization_id
      and (uo.brand_id is null or uo.brand_id = b.id)
  );
$$;

create or replace function public.user_has_org_access(target_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from user_organizations uo
    where uo.user_id = auth.uid() and uo.organization_id = target_org_id
  );
$$;

alter table organizations enable row level security;
alter table brands enable row level security;
alter table stores enable row level security;
alter table sales_channels enable row level security;
alter table user_organizations enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table categories enable row level security;
alter table customers enable row level security;
alter table daily_metrics enable row level security;
alter table alerts enable row level security;
alter table recommendations enable row level security;
alter table imports enable row level security;
alter table integrations enable row level security;
alter table sync_jobs enable row level security;
alter table geographic_metrics enable row level security;

create policy org_select on organizations for select
  using (public.user_has_org_access(id));

create policy brand_select on brands for select
  using (public.user_has_brand_access(id));

create policy store_select on stores for select
  using (public.user_has_store_access(id));

create policy sales_channel_select on sales_channels for select
  using (public.user_has_store_access(store_id));

create policy user_org_select on user_organizations for select
  using (user_id = auth.uid() or public.user_has_org_access(organization_id));

create policy orders_select on orders for select
  using (public.user_has_store_access(store_id));

create policy order_items_select on order_items for select
  using (exists (select 1 from orders o where o.id = order_items.order_id and public.user_has_store_access(o.store_id)));

create policy products_select on products for select
  using (public.user_has_brand_access(brand_id));

create policy product_variants_select on product_variants for select
  using (exists (
    select 1 from sales_channels sc where sc.id = product_variants.sales_channel_id
    and public.user_has_store_access(sc.store_id)
  ));

create policy categories_select on categories for select
  using (public.user_has_brand_access(brand_id));

create policy customers_select on customers for select
  using (public.user_has_org_access(organization_id));

create policy daily_metrics_select on daily_metrics for select
  using (public.user_has_store_access(store_id));

create policy alerts_select on alerts for select
  using (public.user_has_org_access(organization_id));

create policy recommendations_select on recommendations for select
  using (public.user_has_org_access(organization_id));

create policy imports_select on imports for select
  using (public.user_has_org_access(organization_id));

create policy integrations_select on integrations for select
  using (exists (
    select 1 from sales_channels sc where sc.id = integrations.sales_channel_id
    and public.user_has_store_access(sc.store_id)
  ));

create policy sync_jobs_select on sync_jobs for select
  using (exists (
    select 1 from integrations i
    join sales_channels sc on sc.id = i.sales_channel_id
    where i.id = sync_jobs.integration_id and public.user_has_store_access(sc.store_id)
  ));

create policy geographic_metrics_select on geographic_metrics for select
  using (public.user_has_store_access(store_id));

-- Escrita (insert/update/delete) restrita a admin_geral e gestor_marca/loja
-- com escopo correspondente. Exemplo para orders; o mesmo padrão se replica
-- às demais tabelas de negócio nas migrations da Fase 2+.
create policy orders_write on orders for all
  using (
    exists (
      select 1 from user_organizations uo
      join stores s on s.id = orders.store_id
      join brands b on b.id = s.brand_id
      where uo.user_id = auth.uid()
        and uo.organization_id = b.organization_id
        and uo.role in ('admin_geral','gestor_marca','gestor_loja')
        and (uo.brand_id is null or uo.brand_id = b.id)
        and (uo.store_id is null or uo.store_id = s.id)
    )
  );

comment on function public.user_has_store_access is 'Usada pelas policies de RLS para restringir acesso por loja/marca/organização';

-- ---------------------------------------------------------------------
-- FASE 2 — políticas de escrita adicionais (catálogo, clientes, importação)
-- Ver também supabase/migrations/0002_phase2_write_policies.sql
-- ---------------------------------------------------------------------

create or replace function public.user_can_write_brand(target_brand_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from user_organizations uo
    join brands b on b.id = target_brand_id
    where uo.user_id = auth.uid()
      and uo.organization_id = b.organization_id
      and uo.role in ('admin_geral','gestor_marca','gestor_loja')
      and (uo.brand_id is null or uo.brand_id = b.id)
  );
$$;

create or replace function public.user_can_write_org(target_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from user_organizations uo
    where uo.user_id = auth.uid()
      and uo.organization_id = target_org_id
      and uo.role in ('admin_geral','gestor_marca','gestor_loja')
  );
$$;

create or replace function public.user_can_write_store(target_store_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from user_organizations uo
    join stores s on s.id = target_store_id
    join brands b on b.id = s.brand_id
    where uo.user_id = auth.uid()
      and uo.organization_id = b.organization_id
      and uo.role in ('admin_geral','gestor_marca','gestor_loja')
      and (uo.brand_id is null or uo.brand_id = b.id)
      and (uo.store_id is null or uo.store_id = s.id)
  );
$$;

alter table categories enable row level security;
alter table product_variants enable row level security;
alter table imports enable row level security;
alter table import_errors enable row level security;

create policy categories_write on categories for all
  using (public.user_can_write_brand(brand_id))
  with check (public.user_can_write_brand(brand_id));

create policy products_write on products for all
  using (public.user_can_write_brand(brand_id))
  with check (public.user_can_write_brand(brand_id));

create policy product_variants_write on product_variants for all
  using (exists (
    select 1 from sales_channels sc where sc.id = product_variants.sales_channel_id
    and public.user_can_write_store(sc.store_id)
  ))
  with check (exists (
    select 1 from sales_channels sc where sc.id = product_variants.sales_channel_id
    and public.user_can_write_store(sc.store_id)
  ));

create policy customers_write on customers for all
  using (public.user_can_write_org(organization_id))
  with check (public.user_can_write_org(organization_id));

create policy order_items_write on order_items for all
  using (exists (select 1 from orders o where o.id = order_items.order_id and public.user_can_write_store(o.store_id)))
  with check (exists (select 1 from orders o where o.id = order_items.order_id and public.user_can_write_store(o.store_id)));

create policy imports_write on imports for all
  using (public.user_can_write_org(organization_id))
  with check (public.user_can_write_org(organization_id));

create policy import_errors_write on import_errors for all
  using (exists (select 1 from imports i where i.id = import_errors.import_id and public.user_can_write_org(i.organization_id)))
  with check (exists (select 1 from imports i where i.id = import_errors.import_id and public.user_can_write_org(i.organization_id)));

create policy import_errors_select on import_errors for select
  using (exists (select 1 from imports i where i.id = import_errors.import_id and public.user_has_org_access(i.organization_id)));

-- ---------------------------------------------------------------------
-- FASE 3 — credenciais de integração e políticas de escrita restantes
-- Ver também supabase/migrations/0004_integration_credentials_encrypted.sql
-- e 0005_integration_credentials_rls.sql
-- ---------------------------------------------------------------------

alter table integration_credentials enable row level security;
alter table sync_logs enable row level security;

create policy integration_credentials_select on integration_credentials for select
  using (exists (
    select 1 from integrations i
    join sales_channels sc on sc.id = i.sales_channel_id
    where i.id = integration_credentials.integration_id
      and public.user_has_store_access(sc.store_id)
  ));

create policy integration_credentials_write on integration_credentials for all
  using (exists (
    select 1 from integrations i
    join sales_channels sc on sc.id = i.sales_channel_id
    where i.id = integration_credentials.integration_id
      and public.user_can_write_store(sc.store_id)
  ))
  with check (exists (
    select 1 from integrations i
    join sales_channels sc on sc.id = i.sales_channel_id
    where i.id = integration_credentials.integration_id
      and public.user_can_write_store(sc.store_id)
  ));

create policy integrations_write on integrations for all
  using (exists (
    select 1 from sales_channels sc where sc.id = integrations.sales_channel_id
    and public.user_can_write_store(sc.store_id)
  ))
  with check (exists (
    select 1 from sales_channels sc where sc.id = integrations.sales_channel_id
    and public.user_can_write_store(sc.store_id)
  ));

create policy sync_jobs_write on sync_jobs for all
  using (exists (
    select 1 from integrations i
    join sales_channels sc on sc.id = i.sales_channel_id
    where i.id = sync_jobs.integration_id and public.user_can_write_store(sc.store_id)
  ))
  with check (exists (
    select 1 from integrations i
    join sales_channels sc on sc.id = i.sales_channel_id
    where i.id = sync_jobs.integration_id and public.user_can_write_store(sc.store_id)
  ));

create policy sync_logs_select on sync_logs for select
  using (exists (
    select 1 from sync_jobs sj
    join integrations i on i.id = sj.integration_id
    join sales_channels sc on sc.id = i.sales_channel_id
    where sj.id = sync_logs.sync_job_id and public.user_has_store_access(sc.store_id)
  ));

create policy sync_logs_write on sync_logs for all
  using (exists (
    select 1 from sync_jobs sj
    join integrations i on i.id = sj.integration_id
    join sales_channels sc on sc.id = i.sales_channel_id
    where sj.id = sync_logs.sync_job_id and public.user_can_write_store(sc.store_id)
  ))
  with check (exists (
    select 1 from sync_jobs sj
    join integrations i on i.id = sj.integration_id
    join sales_channels sc on sc.id = i.sales_channel_id
    where sj.id = sync_logs.sync_job_id and public.user_can_write_store(sc.store_id)
  ));

alter table cancellations enable row level security;
alter table refunds enable row level security;

create policy cancellations_select on cancellations for select
  using (exists (select 1 from orders o where o.id = cancellations.order_id and public.user_has_store_access(o.store_id)));

create policy cancellations_write on cancellations for all
  using (exists (select 1 from orders o where o.id = cancellations.order_id and public.user_can_write_store(o.store_id)))
  with check (exists (select 1 from orders o where o.id = cancellations.order_id and public.user_can_write_store(o.store_id)));

create policy refunds_select on refunds for select
  using (exists (select 1 from orders o where o.id = refunds.order_id and public.user_has_store_access(o.store_id)));

create policy refunds_write on refunds for all
  using (exists (select 1 from orders o where o.id = refunds.order_id and public.user_can_write_store(o.store_id)))
  with check (exists (select 1 from orders o where o.id = refunds.order_id and public.user_can_write_store(o.store_id)));
