-- Habilita Supabase Realtime (postgres_changes) em orders/order_items pra
-- "Produtos vendidos ao vivo" (/produtos) atualizar sem polling manual. RLS
-- já está habilitado em ambas (ver schema.sql) e o Realtime respeita RLS
-- por conexão autenticada — nenhuma política nova é necessária aqui.
--
-- Importante: isto NÃO torna a sincronização com Anota AI/iFood instantânea
-- — pedidos só chegam no banco quando o cron de sincronização roda (a cada
-- ~10min). O que fica instantâneo é a propagação de uma linha JÁ GRAVADA no
-- banco até a tela aberta, sem precisar recarregar a página.
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
