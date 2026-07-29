-- Novo perfil "Visualizador de produtos" — acesso restrito só a Produtos
-- vendidos, escopado por loja. ALTER TYPE ... ADD VALUE não pode rodar na
-- mesma transação que usa o valor novo, por isso fica em migration própria
-- (rode esta ANTES de 0014_products_viewer_access.sql).
alter type user_role add value if not exists 'products_viewer';
