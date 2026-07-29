-- Perfil "Visualizador de produtos" (products_viewer): acesso restrito e
-- explícito só às tabelas que alimentam "Produtos vendidos" (stores,
-- sales_channels, orders, order_items, products, product_variants), pra
-- loja(s) autorizada(s) — bloqueado de TODO o resto (clientes, integrações,
-- sync_jobs, alertas, recomendações, dados financeiros/geográficos etc.)
-- mesmo que o vínculo seja de organização/marca inteira.
--
-- Mecanismo: as funções genéricas de acesso (usadas por praticamente toda
-- policy de select do schema) passam a EXCLUIR explicitamente o papel
-- products_viewer — então esse papel fica automaticamente bloqueado de
-- tudo que usa essas funções, sem precisar tocar em cada policy uma por
-- uma. Duas funções novas (*_products_viewer_*) dão de volta acesso
-- explícito só nas 6 policies de select necessárias pra essa funcionalidade.

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
      and uo.role <> 'products_viewer'
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
      and uo.role <> 'products_viewer'
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
    where uo.user_id = auth.uid()
      and uo.organization_id = target_org_id
      and uo.role <> 'products_viewer'
  );
$$;

-- Acesso EXPLÍCITO e restrito do Visualizador de produtos.
create or replace function public.user_has_products_viewer_store_access(target_store_id uuid)
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
      and uo.role = 'products_viewer'
      and uo.organization_id = b.organization_id
      and (uo.brand_id is null or uo.brand_id = b.id)
      and (uo.store_id is null or uo.store_id = s.id)
  );
$$;

create or replace function public.user_has_products_viewer_brand_access(target_brand_id uuid)
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
      and uo.role = 'products_viewer'
      and uo.organization_id = b.organization_id
      and (uo.brand_id is null or uo.brand_id = b.id)
  );
$$;

drop policy if exists store_select on stores;
create policy store_select on stores for select
  using (public.user_has_store_access(id) or public.user_has_products_viewer_store_access(id));

drop policy if exists sales_channel_select on sales_channels;
create policy sales_channel_select on sales_channels for select
  using (public.user_has_store_access(store_id) or public.user_has_products_viewer_store_access(store_id));

drop policy if exists orders_select on orders;
create policy orders_select on orders for select
  using (public.user_has_store_access(store_id) or public.user_has_products_viewer_store_access(store_id));

drop policy if exists order_items_select on order_items;
create policy order_items_select on order_items for select
  using (exists (
    select 1 from orders o where o.id = order_items.order_id
      and (public.user_has_store_access(o.store_id) or public.user_has_products_viewer_store_access(o.store_id))
  ));

drop policy if exists products_select on products;
create policy products_select on products for select
  using (public.user_has_brand_access(brand_id) or public.user_has_products_viewer_brand_access(brand_id));

drop policy if exists product_variants_select on product_variants;
create policy product_variants_select on product_variants for select
  using (exists (
    select 1 from sales_channels sc where sc.id = product_variants.sales_channel_id
    and (public.user_has_store_access(sc.store_id) or public.user_has_products_viewer_store_access(sc.store_id))
  ));

-- ---------------------------------------------------------------------
-- Perfil do usuário (login por nome de usuário, sem e-mail na interface)
-- ---------------------------------------------------------------------
-- auth.users ainda exige um e-mail internamente (restrição do Supabase
-- Auth) — usamos um e-mail sintético e privado (username@users.dom-food-
-- analytics.internal), nunca exibido na UI. Esta tabela guarda os dados
-- reais de identificação/gestão do acesso.
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  must_change_password boolean not null default true,
  expires_at timestamptz,
  note text,
  failed_login_count int not null default 0,
  locked_until timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table user_profiles enable row level security;

-- O próprio usuário só vê seu perfil; administradores da mesma organização
-- veem os perfis de quem eles gerenciam (join por user_organizations).
create policy user_profiles_select_self on user_profiles for select
  using (user_id = auth.uid());

create policy user_profiles_select_admin on user_profiles for select
  using (
    exists (
      select 1 from user_organizations admin_uo
      join user_organizations target_uo on target_uo.user_id = user_profiles.user_id
      where admin_uo.user_id = auth.uid()
        and admin_uo.role = 'admin_geral'
        and admin_uo.organization_id = target_uo.organization_id
    )
  );

-- Escrita (criar/editar/redefinir senha/ativar/desativar) só acontece via
-- Server Action com a service role (bypassa RLS) depois de verificar
-- explicitamente que quem chama é admin_geral — não expomos policy de
-- insert/update pro cliente comum.

create index idx_user_profiles_username on user_profiles (username);
