-- =====================================================================
-- Fase 3 — coluna para guardar o token de integração (Anota AI, iFood etc.)
-- já criptografado pela aplicação (AES-256-GCM, ver src/lib/security/crypto.ts).
-- secret_ref continua existindo para quando usarmos um cofre externo
-- (Supabase Vault) no futuro; encrypted_value é o caminho pragmático atual.
-- =====================================================================

alter table integration_credentials
  add column if not exists encrypted_value text;

comment on column integration_credentials.encrypted_value is
  'Token/segredo criptografado com AES-256-GCM pela aplicação. Nunca gravar em texto plano.';
