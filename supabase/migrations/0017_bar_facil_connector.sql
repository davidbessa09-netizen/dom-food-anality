-- Arquitetura do conector Bar Fácil (https://www.barfacil.com.br/).
--
-- IMPORTANTE: esta migration só prepara a estrutura (enum, colunas,
-- tabela de vínculo loja↔estabelecimento). Nenhum endpoint, campo de
-- resposta ou credencial da API do Bar Fácil é inventado aqui — a
-- documentação oficial ainda não foi recebida. A implementação real das
-- chamadas HTTP (src/lib/integrations/bar-facil/connector.ts) permanece
-- lançando "não implementado" até a documentação/credenciais chegarem.

-- Nova plataforma de origem de dados.
alter type platform_type add value if not exists 'bar_facil';

-- ---------------------------------------------------------------------
-- Status de conexão explícito — nenhuma integração deve aparecer como
-- "Conectado" antes de uma autenticação real ser validada. Integrações
-- já existentes (Anota AI) recebem 'ativo' via default, preservando o
-- comportamento atual da tela de Integrações.
-- ---------------------------------------------------------------------
alter table integrations add column if not exists connection_status text not null default 'ativo'
  check (connection_status in ('aguardando_credenciais', 'testando', 'ativo', 'erro'));

-- Configuração não sensível por integração (URL base, ambiente, fuso,
-- identificadores de organização/evento/estabelecimento, data inicial de
-- importação). Nenhum segredo (client secret, api key, token) fica aqui —
-- esses continuam em integration_credentials, criptografados.
alter table integrations add column if not exists config jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- integration_credentials passa a suportar múltiplos segredos nomeados
-- por integração (ex.: client_id não é segredo mas client_secret/api_key/
-- token são) — antes só existia um encrypted_value por integração.
-- Linhas existentes (Anota AI, um token cada) recebem key='token'.
-- ---------------------------------------------------------------------
alter table integration_credentials add column if not exists key text not null default 'token';
alter table integration_credentials add constraint integration_credentials_integration_key_unique unique (integration_id, key);

-- ---------------------------------------------------------------------
-- Vínculo estabelecimento/evento Bar Fácil → loja DOM Food Analytics.
-- Nunca une por nome — external_establishment_id/external_event_id vêm
-- dos IDs oficiais retornados pela API (quando existir); até lá, um
-- admin pode cadastrar o vínculo manualmente a partir do relatório da
-- Bar Fácil, mas o vínculo em si sempre referencia o ID externo, não o
-- nome do estabelecimento.
-- ---------------------------------------------------------------------
create table barfacil_establishment_links (
  id uuid primary key default gen_random_uuid(),
  external_establishment_id text not null,
  external_establishment_name text, -- só informativo/exibição, nunca usado pra casar o vínculo
  external_event_id text,
  store_id uuid references stores(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente', 'vinculado', 'ignorado', 'revisar')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_establishment_id, external_event_id)
);

alter table barfacil_establishment_links enable row level security;

create policy barfacil_establishment_links_select on barfacil_establishment_links for select
  using (
    exists (
      select 1 from user_organizations uo
      where uo.user_id = auth.uid() and uo.role in ('admin_geral', 'gestor_marca', 'gestor_loja')
    )
  );

create policy barfacil_establishment_links_write on barfacil_establishment_links for all
  using (
    exists (
      select 1 from user_organizations uo
      where uo.user_id = auth.uid() and uo.role = 'admin_geral'
    )
  )
  with check (
    exists (
      select 1 from user_organizations uo
      where uo.user_id = auth.uid() and uo.role = 'admin_geral'
    )
  );

-- ---------------------------------------------------------------------
-- sync_runs ganha a origem da sincronização — hoje só existe o ciclo da
-- Anota AI (ver migration 0015); linhas existentes recebem 'anota_ai' via
-- default, preservando o painel de monitoramento atual.
-- ---------------------------------------------------------------------
alter table sync_runs add column if not exists source text not null default 'anota_ai';
