-- Perfil "Visualizador de vendas" (vendas_viewer): acesso restrito e
-- explícito só às tabelas que alimentam a tela Vendas (análise agregada +
-- transações): stores, orders, order_items, customers, brands. Bloqueado
-- de TODO o resto (integrações, sync_jobs, alertas, recomendações,
-- produtos, configurações, usuários etc.) mesmo que o vínculo seja de
-- organização inteira.
--
-- Diferente do "Visualizador de produtos" (escopado por loja), este perfil
-- é sempre ORGANIZAÇÃO INTEIRA — a membership em user_organizations pra
-- esse papel é criada com brand_id e store_id nulos, então as funções
-- abaixo nem checam esses campos: só confirmam que o usuário tem uma
-- membership vendas_viewer na organização dona da loja/marca alvo.
--
-- Mesmo mecanismo do 0014: as funções genéricas de acesso passam a
-- excluir também vendas_viewer (além de products_viewer), e duas funções
-- novas (*_vendas_viewer_*) dão de volta acesso explícito só nas policies
-- necessárias.

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
      and uo.role not in ('products_viewer', 'vendas_viewer')
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
      and uo.role not in ('products_viewer', 'vendas_viewer')
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
      and uo.role not in ('products_viewer', 'vendas_viewer')
  );
$$;

-- Acesso EXPLÍCITO e restrito do Visualizador de vendas — sempre
-- organização inteira, nunca escopado por marca/loja.
create or replace function public.user_has_vendas_viewer_store_access(target_store_id uuid)
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
      and uo.role = 'vendas_viewer'
      and uo.organization_id = b.organization_id
  );
$$;

create or replace function public.user_has_vendas_viewer_brand_access(target_brand_id uuid)
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
      and uo.role = 'vendas_viewer'
      and uo.organization_id = b.organization_id
  );
$$;

create or replace function public.user_has_vendas_viewer_org_access(target_org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from user_organizations uo
    where uo.user_id = auth.uid()
      and uo.role = 'vendas_viewer'
      and uo.organization_id = target_org_id
  );
$$;

drop policy if exists store_select on stores;
create policy store_select on stores for select
  using (
    public.user_has_store_access(id)
    or public.user_has_products_viewer_store_access(id)
    or public.user_has_vendas_viewer_store_access(id)
  );

drop policy if exists orders_select on orders;
create policy orders_select on orders for select
  using (
    public.user_has_store_access(store_id)
    or public.user_has_products_viewer_store_access(store_id)
    or public.user_has_vendas_viewer_store_access(store_id)
  );

drop policy if exists order_items_select on order_items;
create policy order_items_select on order_items for select
  using (exists (
    select 1 from orders o where o.id = order_items.order_id
      and (
        public.user_has_store_access(o.store_id)
        or public.user_has_products_viewer_store_access(o.store_id)
        or public.user_has_vendas_viewer_store_access(o.store_id)
      )
  ));

drop policy if exists brand_select on brands;
create policy brand_select on brands for select
  using (public.user_has_brand_access(id) or public.user_has_vendas_viewer_brand_access(id));

drop policy if exists customers_select on customers;
create policy customers_select on customers for select
  using (public.user_has_org_access(organization_id) or public.user_has_vendas_viewer_org_access(organization_id));
