# METRICS.md — Dicionário de métricas

Classificação usada em toda métrica:

- **Real**: valor que vem diretamente da fonte (Anota AI, iFood ou importação),
  sem transformação além de tipagem/conversão de moeda.
- **Calculado**: derivado por fórmula determinística a partir de dados reais
  (ex.: ticket médio = soma ÷ contagem). Sempre correto se os dados de entrada
  estiverem corretos.
- **Estimado**: envolve inferência, limiar arbitrário ou julgamento estatístico
  (ex.: classificação "alta procura" de um bairro, matriz de diagnóstico de
  produto). Deve vir sempre acompanhado do grau de confiança.

Todo cálculo abaixo é implementado em `src/lib/metrics/` como função pura testada
(ver `tests/metrics/*.test.ts`), nunca direto em query solta espalhada pela UI.

## Indicadores executivos

| Métrica | Fórmula | Fonte | Classificação | Limitações |
|---|---|---|---|---|
| Faturamento bruto | `SUM(orders.gross_amount)` para pedidos não cancelados no período | `orders` | Real | Depende de o valor bruto ser corretamente reportado pela plataforma |
| Faturamento líquido | `SUM(orders.net_amount)` quando não nulo | `orders` | Real (quando disponível) | iFood/Anota AI podem não expor líquido via API pública; se `net_amount` for nulo em todos os pedidos do filtro, exibir "dado indisponível" |
| Total de pedidos | `COUNT(orders.id)` no período | `orders` | Real | — |
| Pedidos concluídos | `COUNT(*) WHERE status = 'concluido'` | `orders` | Real | — |
| Pedidos cancelados | `COUNT(*) WHERE status = 'cancelado'` | `orders` | Real | — |
| Taxa de cancelamento | `pedidos_cancelados / total_pedidos` | `orders` | Calculado | Sensível a período curto/baixo volume |
| Ticket médio | `faturamento_bruto / pedidos_concluidos` | `orders` | Calculado | — |
| Itens por pedido | `SUM(order_items.quantity) / pedidos_concluidos` | `order_items` | Calculado | Adicionais (`is_addon=true`) contam como item — decisão de produto, documentar se mudar |
| Descontos concedidos | `SUM(orders.discount_amount)` | `orders`/`discounts` | Real | — |
| Taxas de entrega | `SUM(orders.delivery_fee_amount)` | `orders`/`delivery_fees` | Real | — |
| Clientes únicos | `COUNT(DISTINCT customer_id)` (exclui nulos) | `orders` | Real | Pedidos sem cliente identificado ficam fora da contagem — mostrar separadamente "pedidos sem identificação" |
| Clientes novos | Clientes cujo `MIN(orders.ordered_at)` cai dentro do período | `orders` | Calculado | Depende de histórico completo desde o primeiro pedido já sincronizado — se a sincronização começou depois da abertura da loja, o "novo" pode ser falso-novo |
| Clientes recorrentes | Clientes com pedido no período E pedido anterior ao período | `orders` | Calculado | Mesma limitação acima |
| Taxa de recompra | `clientes_recorrentes / clientes_unicos` | `orders` | Calculado | — |
| Crescimento vs. período anterior | `(valor_atual - valor_anterior) / valor_anterior` | qualquer métrica acima | Calculado | Período anterior deve ter mesmo número de dias; comparação com ano anterior só é exibida se houver dados sincronizados cobrindo aquele intervalo |

## Produtos

| Métrica | Fórmula | Classificação | Limitações |
|---|---|---|---|
| Quantidade vendida | `SUM(order_items.quantity)` por produto canônico | Real | Requer variantes já associadas ao produto canônico; itens pendentes de correspondência aparecem à parte |
| Receita gerada | `SUM(order_items.total_price)` | Real | — |
| Participação no faturamento | `receita_produto / faturamento_bruto_total` | Calculado | — |
| Ticket médio dos pedidos com o produto | `SUM(gross_amount) / COUNT(pedidos que contêm o produto)` | Calculado | — |
| Frequência de compra conjunta | `COUNT(pedidos com produto A e B)` | Calculado | Requer volume mínimo para não sugerir combo por coincidência (ver regra de associação, `INTEGRATIONS.md`) |
| Dias desde a última venda | `hoje - MAX(orders.ordered_at)` para itens do produto | Calculado | — |
| Matriz de diagnóstico (campeão / invisível / etc.) | Cruza volume de venda (real) com visualizações/cliques (real, só quando SDK ativo) | **Estimado** quando falta o eixo de visualização; caso contrário calculado | Ver `INTEGRATIONS.md` — sem eventos de navegação, o sistema não classifica os quadrantes que dependem de visualização, mostra apenas o eixo de vendas |

## Jornada do cliente / funil

| Métrica | Fórmula | Classificação | Limitações |
|---|---|---|---|
| Usuários por etapa | `COUNT(DISTINCT session/anonymous_id)` com evento daquela etapa | Real (só com SDK ativo) | Sem SDK, etapa não existe — não é zero, é "sem rastreamento" |
| Taxa de avanço/abandono | `etapa_n / etapa_(n-1)` | Calculado (só com SDK ativo) | — |
| Tempo médio entre etapas | `AVG(occurred_at_n - occurred_at_(n-1))` | Calculado (só com SDK ativo) | Sessões sem fechamento (`ended_at` nulo) são excluídas do cálculo de tempo total, mas contam nas etapas alcançadas |
| Jornada quando só há dados de pedido (Anota AI/iFood sem SDK) | Mostra apenas: pedido criado → confirmado → concluído/cancelado | Real | Rotulado explicitamente como "funil parcial"; etapas de navegação (visualização, carrinho, checkout) aparecem como "sem rastreamento disponível", nunca como 0 ou traço |

## Clientes / RFM

| Métrica | Fórmula | Classificação | Limitações |
|---|---|---|---|
| Recência | `hoje - MAX(orders.ordered_at)` do cliente | Calculado | — |
| Frequência | `COUNT(orders)` do cliente no período de referência | Calculado | — |
| Valor monetário | `SUM(orders.gross_amount)` do cliente | Calculado | — |
| Segmento RFM | Quintil/percentil de R, F, M configurável | Estimado | Limiares (quintis) são relativos à base atual — mudam conforme a base cresce; documentar a janela de cálculo usada em cada relatório |
| Risco de inatividade | Recência acima de N desvios do intervalo médio de compra do cliente | Estimado | N configurável; não é uma previsão, é um sinalizador estatístico simples |

## Cancelamentos

| Métrica | Fórmula | Classificação | Limitações |
|---|---|---|---|
| Taxa de cancelamento por loja/produto/plataforma | `cancelados / total` no recorte | Calculado | — |
| Valor perdido | `SUM(orders.gross_amount) WHERE status='cancelado'` | Real | Não deduz custo de insumo (não temos CMV) — é valor de venda perdido, não lucro perdido |
| Motivo do cancelamento | `cancellations.reason` | Real quando a plataforma informa; senão "motivo não informado" | Nunca inferido |

## Bairros e regiões

| Métrica | Fórmula | Classificação | Limitações |
|---|---|---|---|
| Pedidos/faturamento por bairro | Agregação de `orders` por `neighborhood_id` | Real | Pedidos com bairro não normalizado ficam fora do agregado até revisão manual |
| Classificação de procura (alta/média/baixa) | Percentil do volume de pedidos do bairro dentro da área atendida no período | Estimado | Percentil, não limite fixo; "baixa procura" ≠ "baixo potencial" (ver `ARCHITECTURE.md`/pedido original) — potencial só é reportado se houver dados de população/visitas/cobertura, senão o rótulo é sempre "baixa procura registrada" |
| Tempo médio de entrega | `AVG(delivered_at - confirmed_at)` | Real quando a plataforma expõe os timestamps; senão "dado indisponível" | — |

## Qualidade dos dados

Todas as métricas desta página (pedidos duplicados, produtos sem correspondência,
campos ausentes etc.) são contagens diretas (`Real`) sobre o próprio banco —
nenhuma é estimada.
