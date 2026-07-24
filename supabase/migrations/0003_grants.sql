-- =====================================================================
-- Corrige grants no schema public — necessário quando o schema public é
-- recriado manualmente (drop schema public cascade; create schema public;),
-- pois isso remove os grants padrão que o Supabase normalmente já configura
-- para anon/authenticated. RLS continua sendo a camada que decide QUAIS
-- linhas são visíveis; sem este grant, o Postgres nega o acesso à tabela
-- inteira antes mesmo de avaliar as policies.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
