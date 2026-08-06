-- sales_channels nunca teve uma policy de ESCRITA — só existia
-- `sales_channel_select` (ver migration original). Isso nunca deu
-- problema porque, até agora, toda linha de sales_channels vinha de
-- migration/seed, nenhuma ação do usuário criava uma diretamente.
--
-- A configuração do Bar Fácil (getOrCreatePlaceholderChannel e
-- getOrCreateBarFacilSalesChannel, em src/app/(dashboard)/integracoes/
-- bar-facil-actions.ts e src/lib/integrations/bar-facil/sync.ts) foi a
-- primeira a precisar inserir uma linha nova em sales_channels a partir
-- de uma sessão de usuário comum — sem esta policy, o INSERT falhava
-- silenciosamente sob RLS (retornando null, não uma exceção), o que
-- aparecia na tela como "canal de vendas base ausente".
--
-- Mesmo padrão já usado em `integrations_write`: só quem pode escrever
-- na loja (user_can_write_store) pode criar/alterar o canal de vendas
-- daquela loja.
create policy sales_channels_write on sales_channels for all
  using (public.user_can_write_store(store_id))
  with check (public.user_can_write_store(store_id));
