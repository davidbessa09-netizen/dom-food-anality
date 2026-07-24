-- =====================================================================
-- Fase 2 — políticas de escrita (insert/update/delete) para as tabelas
-- usadas pelo fluxo de importação CSV/Excel e cadastro de catálogo.
-- Rodar depois de supabase/schema.sql se o banco já existir.
-- =====================================================================

-- Função genérica: o usuário logado pode escrever nesta marca (é
-- admin_geral, gestor_marca ou gestor_loja com escopo compatível)?
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
