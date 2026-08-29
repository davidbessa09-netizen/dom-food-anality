-- Novo perfil "Colaborador" — acesso de organização inteira (mesmo
-- alcance de dados que admin_geral: sem restrição por marca/loja), mas com
-- o MENU/rotas restritos só às abas liberadas explicitamente em
-- user_module_access (ver 0022_colaborador_module_access.sql). Cada aba é
-- Sem acesso / Ver — não existe "editar" pra esse perfil, é sempre
-- somente leitura (ver hasWriteAccess em lib/auth/session.ts, que não
-- inclui 'colaborador'). ALTER TYPE ... ADD VALUE não pode rodar na mesma
-- transação que usa o valor novo, por isso fica em migration própria
-- (rode esta ANTES de 0022_colaborador_module_access.sql).
alter type user_role add value if not exists 'colaborador';
