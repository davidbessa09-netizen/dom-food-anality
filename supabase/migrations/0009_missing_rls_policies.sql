-- Fecha uma lacuna de segurança real: 15 tabelas do schema original ficaram
-- sem RLS habilitado (algumas, como menu_events, já são consultadas pela
-- aplicação). Sem RLS, qualquer usuário autenticado pode ler/escrever essas
-- tabelas de QUALQUER organização via API REST do Supabase, independente do
-- que a UI do Next.js filtra — RLS é a política de acesso primária (ver
-- SECURITY.md), não apenas uma conveniência de código.

alter table audit_logs enable row level security;
alter table product_category_history enable row level security;
alter table product_price_history enable row level security;
alter table customer_identities enable row level security;
alter table payments enable row level security;
alter table discounts enable row level security;
alter table coupons enable row level security;
alter table delivery_fees enable row level security;
alter table menu_sessions enable row level security;
alter table menu_events enable row level security;
alter table cities enable row level security;
alter table neighborhoods enable row level security;
alter table neighborhood_aliases enable row level security;
alter table postal_codes enable row level security;
alter table delivery_zones enable row level security;

-- audit_logs: organization_id é nullable (logs de sistema); só expõe linhas
-- já associadas a uma organização à qual o usuário tem acesso.
create policy audit_logs_select on audit_logs for select
  using (organization_id is not null and public.user_has_org_access(organization_id));

create policy audit_logs_write on audit_logs for all
  using (organization_id is not null and public.user_can_write_org(organization_id))
  with check (organization_id is not null and public.user_can_write_org(organization_id));

create policy product_category_history_select on product_category_history for select
  using (exists (
    select 1 from products p where p.id = product_category_history.product_id
    and public.user_has_brand_access(p.brand_id)
  ));

create policy product_category_history_write on product_category_history for all
  using (exists (
    select 1 from products p where p.id = product_category_history.product_id
    and public.user_can_write_brand(p.brand_id)
  ))
  with check (exists (
    select 1 from products p where p.id = product_category_history.product_id
    and public.user_can_write_brand(p.brand_id)
  ));

create policy product_price_history_select on product_price_history for select
  using (exists (
    select 1 from products p where p.id = product_price_history.product_id
    and public.user_has_brand_access(p.brand_id)
  ));

create policy product_price_history_write on product_price_history for all
  using (exists (
    select 1 from products p where p.id = product_price_history.product_id
    and public.user_can_write_brand(p.brand_id)
  ))
  with check (exists (
    select 1 from products p where p.id = product_price_history.product_id
    and public.user_can_write_brand(p.brand_id)
  ));

create policy customer_identities_select on customer_identities for select
  using (exists (
    select 1 from customers c where c.id = customer_identities.customer_id
    and public.user_has_org_access(c.organization_id)
  ));

create policy customer_identities_write on customer_identities for all
  using (exists (
    select 1 from customers c where c.id = customer_identities.customer_id
    and public.user_can_write_org(c.organization_id)
  ))
  with check (exists (
    select 1 from customers c where c.id = customer_identities.customer_id
    and public.user_can_write_org(c.organization_id)
  ));

create policy payments_select on payments for select
  using (exists (select 1 from orders o where o.id = payments.order_id and public.user_has_store_access(o.store_id)));

create policy payments_write on payments for all
  using (exists (select 1 from orders o where o.id = payments.order_id and public.user_can_write_store(o.store_id)))
  with check (exists (select 1 from orders o where o.id = payments.order_id and public.user_can_write_store(o.store_id)));

create policy discounts_select on discounts for select
  using (exists (select 1 from orders o where o.id = discounts.order_id and public.user_has_store_access(o.store_id)));

create policy discounts_write on discounts for all
  using (exists (select 1 from orders o where o.id = discounts.order_id and public.user_can_write_store(o.store_id)))
  with check (exists (select 1 from orders o where o.id = discounts.order_id and public.user_can_write_store(o.store_id)));

create policy coupons_select on coupons for select
  using (public.user_has_brand_access(brand_id));

create policy coupons_write on coupons for all
  using (public.user_can_write_brand(brand_id))
  with check (public.user_can_write_brand(brand_id));

create policy delivery_fees_select on delivery_fees for select
  using (exists (select 1 from orders o where o.id = delivery_fees.order_id and public.user_has_store_access(o.store_id)));

create policy delivery_fees_write on delivery_fees for all
  using (exists (select 1 from orders o where o.id = delivery_fees.order_id and public.user_can_write_store(o.store_id)))
  with check (exists (select 1 from orders o where o.id = delivery_fees.order_id and public.user_can_write_store(o.store_id)));

create policy menu_sessions_select on menu_sessions for select
  using (public.user_has_store_access(store_id));

create policy menu_sessions_write on menu_sessions for all
  using (public.user_can_write_store(store_id))
  with check (public.user_can_write_store(store_id));

-- menu_events.store_id é nullable no schema original; sem store_id não há
-- como validar acesso, então essas linhas ficam invisíveis por padrão (nunca
-- expostas por engano) até serem corrigidas na origem.
create policy menu_events_select on menu_events for select
  using (store_id is not null and public.user_has_store_access(store_id));

create policy menu_events_write on menu_events for all
  using (store_id is not null and public.user_can_write_store(store_id))
  with check (store_id is not null and public.user_can_write_store(store_id));

-- cities/neighborhoods/neighborhood_aliases/postal_codes: dado de referência
-- geográfica compartilhado entre organizações (não têm organization_id/
-- brand_id/store_id) — leitura liberada para qualquer usuário autenticado,
-- escrita restrita a admin_geral de qualquer organização (mantém o
-- dicionário compartilhado, mas evita que qualquer usuário autenticado
-- edite/apague dado usado por todos os tenants).
create policy cities_select on cities for select
  using (auth.role() = 'authenticated');

create policy cities_write on cities for all
  using (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.role = 'admin_geral'))
  with check (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.role = 'admin_geral'));

create policy neighborhoods_select on neighborhoods for select
  using (auth.role() = 'authenticated');

create policy neighborhoods_write on neighborhoods for all
  using (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.role = 'admin_geral'))
  with check (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.role = 'admin_geral'));

create policy neighborhood_aliases_select on neighborhood_aliases for select
  using (auth.role() = 'authenticated');

create policy neighborhood_aliases_write on neighborhood_aliases for all
  using (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.role = 'admin_geral'))
  with check (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.role = 'admin_geral'));

create policy postal_codes_select on postal_codes for select
  using (auth.role() = 'authenticated');

create policy postal_codes_write on postal_codes for all
  using (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.role = 'admin_geral'))
  with check (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.role = 'admin_geral'));

create policy delivery_zones_select on delivery_zones for select
  using (public.user_has_store_access(store_id));

create policy delivery_zones_write on delivery_zones for all
  using (public.user_can_write_store(store_id))
  with check (public.user_can_write_store(store_id));
