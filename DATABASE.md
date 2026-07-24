# DATABASE.md — Modelo de dados

Schema completo em [`supabase/schema.sql`](supabase/schema.sql). Este documento
descreve as decisões de modelagem; para a definição exata de colunas, o SQL é a
fonte de verdade.

## 1. Hierarquia organizacional

```
organizations (1) ──< brands (N) ──< stores (N) ──< sales_channels (N)
```

- Uma **organization** pode ter várias **brands** (Gulas, Nikô Sushi, Kings
  Chicken são marcas distintas; se as 3 lojas iFood forem, por exemplo, marcas
  independentes ou lojas de uma marca guarda-chuva, isso é modelado livremente —
  o schema não assume qual).
- Uma **brand** pode ter várias **stores** (ex.: Nikô Sushi Palhoça e Nikô Sushi
  Floripa são duas `stores` da mesma `brand` "Nikô Sushi").
- Uma **store** pode operar em vários **sales_channels** (a mesma loja física pode
  vender por Anota AI e por iFood ao mesmo tempo — chave `(store_id, platform)`).

## 2. Por que `products` e `product_variants` são tabelas separadas

O mesmo produto pode ter nomes diferentes por plataforma ("Combo Chef 100 peças"
no Anota AI, "CHEF 100 UN" no iFood). Modelamos:

- `products`: o produto **canônico**, usado em toda análise consolidada.
- `product_variants`: uma linha por combinação (canal de venda × nome original),
  com `match_status` (`pendente | sugerido | aprovado | rejeitado`) e
  `match_confidence`. Nunca setamos `product_id` automaticamente quando
  `match_confidence` está abaixo do limiar de segurança — fica pendente na tela
  de "Correspondência de produtos" até aprovação manual.
- `order_items.original_name` sempre guarda o nome bruto do pedido, mesmo antes
  de qualquer associação — o nome original nunca é perdido.

## 3. Clientes com identidade fragmentada

- `customers`: entidade canônica dentro de uma organização, com telefone/e-mail
  **mascarados** para exibição (`phone_masked`, `email_masked`) e hashes
  (`phone_hash`, `email_hash`) usados só para deduplicação — nunca para exibir o
  dado em claro.
- `customer_identities`: liga um cliente a IDs específicos de cada canal (Anota
  AI e iFood não compartilham ID de cliente).
- `orders.customer_id` é **nullable**: pedidos sem identificação suficiente do
  cliente permanecem como "cliente não identificado", nunca são forçados a um
  registro genérico.

## 4. Pedidos, itens, pagamentos e cancelamentos

- `orders` guarda os campos de proveniência obrigatórios definidos na
  arquitetura: `source_platform`, `source_external_id`, `synced_at`,
  `source_updated_at`, `sync_status`, `raw_payload`, `connector_version`.
- Unicidade `(sales_channel_id, source_external_id)` garante idempotência: reimportar
  ou ressincronizar o mesmo pedido faz `UPDATE`, nunca duplica.
- `order_items.parent_item_id` modela adicionais/complementos vinculados a um
  item principal (ex.: "Molho extra" dentro do pedido de um combo).
- `cancellations.reason_source` distingue se o motivo veio da própria
  plataforma, do cliente, da loja, ou se é `nao_informado` — a UI mostra
  literalmente "motivo não informado" nesse último caso, nunca infere um motivo.
- `payments`, `discounts`, `coupons`, `delivery_fees`, `refunds` são tabelas
  próprias (não colunas soltas em `orders`) porque um pedido pode ter múltiplos
  pagamentos parciais, múltiplos descontos, e reembolso parcial distinto de
  cancelamento total.

## 5. Preço e categoria — histórico, não sobrescrita

`product_price_history` e `product_category_history` guardam `valid_from`/
`valid_to`. Trocar o preço de um produto nunca apaga o valor anterior — qualquer
métrica histórica (ticket médio de 3 meses atrás) continua correta mesmo após
reprecificação.

## 6. Jornada do cliente — regra de honestidade

`menu_sessions` e `menu_events` só existem quando há rastreamento real via SDK
próprio (ver `INTEGRATIONS.md`, seção "Regra crítica do funil"). Essas tabelas
nunca são preenchidas a partir de inferência sobre dados de pedido — se não há
evento, não há linha, e a tela de jornada mostra "funil parcial" em vez de
inventar uma etapa.

## 7. Bairros e regiões

- `neighborhood_aliases.raw_value` preserva a grafia exata recebida da
  plataforma ("Centro", "centro", "CENTRO - Palhoça" viram 3 alias distintos).
- `neighborhood_id` em `neighborhood_aliases` é **nullable**: quando a
  confiança da normalização automática (`pg_trgm` similarity) não passa do
  limiar configurado, o alias fica sem bairro até revisão manual em
  "Qualidade dos dados geográficos".
- Nenhuma tabela guarda endereço residencial completo do cliente — apenas
  bairro/CEP/zona agregados, conforme exigido para o mapa de calor.

## 8. Alertas e recomendações — sempre com evidência

`alerts` e `recommendations` têm coluna `confidence` (`real | calculado |
estimado`) e `evidence jsonb` obrigatória. Nenhuma linha é inserida sem os
números que a embasam — a UI nunca mostra uma recomendação "pelada".

## 9. Importação

`imports` + `import_errors` implementam o fluxo completo: upload → mapeamento
(`column_mapping jsonb`) → validação → importação → relatório de erros. O campo
`undone_at` permite desfazer uma importação (as linhas de `orders`/`products`/etc.
geradas por aquele import guardam `raw_payload.import_id` para permitir reversão
seletiva — implementado na Fase 2).

## 10. Diagrama simplificado (Fase 1 + 2)

```
organizations ─┬─< brands ─┬─< stores ─┬─< sales_channels ─┬─< integrations ─< sync_jobs ─< sync_logs
               │           │           │                   └─< product_variants >─ products
               │           │           └─< orders ─┬─< order_items
               │           │                        ├─< payments
               │           │                        ├─< discounts
               │           │                        ├─< delivery_fees
               │           │                        └─< cancellations ── refunds
               │           └─< categories ─< products ─< product_price_history
               ├─< customers ─< customer_identities
               ├─< user_organizations >─ auth.users
               └─< alerts / recommendations / imports / audit_logs
```

## 11. RLS — modelo de permissão

Ver função `auth.user_has_store_access` em `schema.sql`. Regra: um usuário só
enxerga linhas cuja `store`/`brand`/`organization` tenha um vínculo correspondente
em `user_organizations` — e esse vínculo pode ser restrito por `brand_id` e/ou
`store_id`. Um `gestor_loja` do Nikô Palhoça recebe uma linha em
`user_organizations` com `store_id` = Nikô Palhoça; a policy de `orders`/`stores`
bloqueia qualquer linha de outra loja automaticamente no nível do Postgres —
não depende de filtro correto no código do frontend.
