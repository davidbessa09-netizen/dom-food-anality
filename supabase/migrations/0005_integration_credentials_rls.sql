-- =====================================================================
-- RLS para integration_credentials — faltava (a tabela guarda tokens
-- criptografados; sem RLS, qualquer usuário autenticado poderia ler/gravar
-- credenciais de qualquer loja, mesmo que o valor esteja cifrado).
-- =====================================================================

alter table integration_credentials enable row level security;

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

-- integrations e sync_jobs também precisam de policy de escrita (só tinham select).
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

alter table sync_logs enable row level security;

create policy sync_logs_select on sync_logs for select
  using (exists (
    select 1 from sync_jobs sj
    join integrations i on i.id = sj.integration_id
    join sales_channels sc on sc.id = i.sales_channel_id
    where sj.id = sync_logs.sync_job_id and public.user_has_store_access(sc.store_id)
  ));
