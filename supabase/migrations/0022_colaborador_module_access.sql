-- Tabela de permissões por aba do perfil "Colaborador": uma linha = uma
-- aba liberada (Sem acesso / Ver, sem granularidade de edição). O
-- vínculo em user_organizations pra esse papel é sempre organização
-- inteira (brand_id/store_id nulos) — as funções genéricas de acesso
-- (user_has_store_access etc., ver 0014/0020) já tratam 'colaborador'
-- como acesso de dado completo da organização, igual admin_geral; o que
-- este mecanismo restringe é só QUAIS PÁGINAS o usuário pode abrir
-- (checado no middleware, ver lib/supabase/middleware.ts).
create table if not exists user_module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  module text not null,
  created_at timestamptz not null default now(),
  unique (user_id, module)
);

alter table user_module_access enable row level security;

-- Só o próprio usuário lê suas permissões (usado pelo middleware e pelo
-- layout do dashboard pra montar o menu) — toda escrita/gestão passa pela
-- service role nas server actions de /usuarios (mesmo padrão de
-- products_viewer/vendas_viewer), nunca pelo client autenticado normal.
drop policy if exists user_module_access_select_own on user_module_access;
create policy user_module_access_select_own on user_module_access for select
  using (user_id = auth.uid());
