-- =====================================================================
-- A Anota AI retorna um terceiro tipo de retirada ("LOCAL" = consumo no
-- estabelecimento, ex.: mesa/comanda), que não existia no enum original
-- (só tínhamos entrega/retirada). Adicionamos sem quebrar dados existentes.
-- =====================================================================

alter type order_fulfillment add value if not exists 'consumo_local';
