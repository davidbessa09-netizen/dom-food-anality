-- Novo perfil "Visualizador de vendas" — acesso restrito só à aba Vendas
-- (análise agregada + transações), sem escopo por loja: enxerga TODAS as
-- lojas/marcas da organização (uso: RH consultando pedidos da empresa
-- inteira). ALTER TYPE ... ADD VALUE não pode rodar na mesma transação
-- que usa o valor novo, por isso fica em migration própria (rode esta
-- ANTES de 0020_vendas_viewer_access.sql).
alter type user_role add value if not exists 'vendas_viewer';
