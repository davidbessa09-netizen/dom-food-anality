-- =====================================================================
-- secret_ref era NOT NULL no schema original, pensado para um cofre externo
-- (Supabase Vault). Como o caminho atual é encrypted_value (criptografia na
-- aplicação), secret_ref precisa ser opcional.
-- =====================================================================

alter table integration_credentials alter column secret_ref drop not null;
