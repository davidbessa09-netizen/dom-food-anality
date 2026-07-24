-- =====================================================================
-- cancellations/refunds não tinham RLS (gap de segurança), e cancellations
-- não tinha unique constraint em order_id (necessário para upsert
-- idempotente vindo dos adaptadores de integração).
-- =====================================================================

alter table cancellations add constraint cancellations_order_id_key unique (order_id);

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
