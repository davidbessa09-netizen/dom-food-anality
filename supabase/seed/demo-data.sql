-- =====================================================================
-- Dados de DEMONSTRAÇÃO — nunca misturar com dados reais.
-- Toda organização aqui tem is_demo = true; a UI mostra a faixa
-- "DEMONSTRAÇÃO" automaticamente. Para limpar: ver DEPLOYMENT.md
-- (DELETE FROM organizations WHERE is_demo = true; -- cascade cuida do resto)
-- =====================================================================

insert into organizations (id, name, is_demo, timezone)
values ('00000000-0000-0000-0000-000000000001', 'DOM Food Park (demonstração)', true, 'America/Sao_Paulo');

insert into brands (id, organization_id, name, slug, color_hex) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Gulas', 'gulas', '#e11d48'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Nikô Sushi', 'niko-sushi', '#0ea5e9'),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Kings Chicken', 'kings-chicken', '#f59e0b'),
  ('00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'Lojas iFood', 'lojas-ifood', '#16a34a');

insert into stores (id, brand_id, name, city, state, is_active) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000011', 'Gulas', 'Palhoça', 'SC', true),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000012', 'Nikô Sushi Palhoça', 'Palhoça', 'SC', true),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000012', 'Nikô Sushi Floripa', 'Florianópolis', 'SC', true),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000013', 'Kings Chicken', 'Palhoça', 'SC', true),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000014', 'Loja iFood 1', 'Palhoça', 'SC', true),
  ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000014', 'Loja iFood 2', 'Florianópolis', 'SC', true),
  ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000014', 'Loja iFood 3', 'São José', 'SC', true);

insert into sales_channels (store_id, platform) values
  ('00000000-0000-0000-0000-000000000101', 'anota_ai'),
  ('00000000-0000-0000-0000-000000000102', 'anota_ai'),
  ('00000000-0000-0000-0000-000000000103', 'anota_ai'),
  ('00000000-0000-0000-0000-000000000104', 'anota_ai'),
  ('00000000-0000-0000-0000-000000000105', 'ifood'),
  ('00000000-0000-0000-0000-000000000106', 'ifood'),
  ('00000000-0000-0000-0000-000000000107', 'ifood');

-- Depois de criar seu usuário em Authentication → Users, associe-o à
-- organização de demonstração com acesso total substituindo o UUID abaixo
-- pelo id real do usuário (auth.users.id):
--
-- insert into user_organizations (user_id, organization_id, role)
-- values ('<SEU_USER_ID_AQUI>', '00000000-0000-0000-0000-000000000001', 'admin_geral');
