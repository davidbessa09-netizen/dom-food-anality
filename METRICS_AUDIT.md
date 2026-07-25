# METRICS_AUDIT.md — Auditoria semântica de KPIs (2026-07-25)

Auditoria do **código real** (não da documentação) de cada indicador listado,
comparando a base de dados (filtros aplicados, status considerado, tratamento
de cancelado/desconto/taxa) entre todas as telas onde o indicador aparece.
**Nenhum número foi alterado nesta auditoria** — só leitura e documentação.
Onde encontrei inconsistência real, está na seção 2, com a query exata, a
causa e uma correção proposta (não aplicada).

## 1. Dicionário por indicador

### Faturamento bruto

| Campo | Valor |
|---|---|
| Definição | Soma do valor bruto de venda dos pedidos do período |
| Fórmula | `SUM(orders.gross_amount)` |
| Numerador | `gross_amount` de cada pedido |
| Denominador | — (soma simples) |
| Status considerado | Todos **exceto** `cancelado` (inclui `criado`, `confirmado`, `em_preparo`, `saiu_para_entrega`, `concluido`) |
| Canal | Todos (nenhum filtro de `source_platform`) nas telas Dashboard/Lojas/Vendas |
| Timezone | `America/Sao_Paulo` (limites do período resolvidos por `resolvePeriod`/`resolveCustomPeriod`) |
| Cancelados | Excluídos |
| Descontos/taxas | **Não deduzidos** — `gross_amount` é o valor bruto, descontos e taxas são exibidos como métricas separadas, nunca subtraídos daqui |
| Dado ausente | Nunca é `null` — pedidos inexistentes resultam em `0`, o que é correto (soma vazia = zero, diferente de "não sincronizado") |
| Implementação | `grossRevenue()` em `src/lib/metrics/orders.ts:32` |
| Onde aparece | Dashboard executivo, Comparação de lojas |

⚠️ **Ponto de atenção (não é bug, é decisão que precisa estar visível na UI):** inclui pedidos ainda **em andamento** (`criado`, `confirmado`, `em_preparo`, `saiu_para_entrega`) — ou seja, "faturamento bruto" não é só venda finalizada, é toda venda registrada e não cancelada até o momento da consulta. Ver inconsistência #1 abaixo sobre como isso interage com o Ticket médio.

### Faturamento líquido

| Campo | Valor |
|---|---|
| Definição | Soma do valor líquido (pós-taxas de plataforma), quando a origem informa |
| Fórmula | `SUM(orders.net_amount)` só para pedidos com `net_amount` não nulo |
| Status considerado | Todos exceto `cancelado` |
| Dado ausente | Se **nenhum** pedido do recorte tiver `net_amount`, retorna `null` → UI mostra "Dado indisponível — plataforma/importação não informou valor líquido" (nunca `R$ 0,00`) |
| Implementação | `netRevenue()` em `orders.ts:37` |
| Onde aparece | Dashboard executivo |

Comportamento correto e já testado (`tests/metrics/orders.test.ts`). Hoje sempre retorna "indisponível" na prática porque nenhum adapter (Anota AI/iFood/CSV) preenche `net_amount` ainda — isso é honesto, não é bug.

### Ticket médio

| Campo | Valor |
|---|---|
| Definição | Valor médio por pedido **concluído** |
| Fórmula | `SUM(gross_amount WHERE status='concluido') / COUNT(status='concluido')` |
| Numerador | Soma de `gross_amount` **só dos pedidos concluídos** |
| Denominador | Contagem de pedidos concluídos |
| Status considerado | **Só `concluido`** |
| Dado ausente | `null` se não há pedido concluído no recorte |
| Implementação | `averageTicket()` em `orders.ts:62` |
| Onde aparece | Dashboard executivo, Comparação de lojas |

🔴 **Ver inconsistência #1** — a base do numerador é diferente da base de "Faturamento bruto" mostrado ao lado.

### Total de pedidos

| Campo | Valor |
|---|---|
| Definição | Contagem bruta de registros de pedido no período |
| Fórmula | `COUNT(orders.id)` |
| Status considerado | **Todos, incluindo cancelados** e todos os estágios em andamento |
| Implementação | `totalOrders()` em `orders.ts:43` (`orders.length`) |
| Onde aparece | Dashboard executivo, Comparação de lojas |

### Pedidos concluídos

| Campo | Valor |
|---|---|
| Fórmula | `COUNT(*) WHERE status='concluido'` |
| Implementação | `completedOrdersCount()` em `orders.ts:47` |
| Onde aparece | Dashboard executivo, Comparação de lojas |

### Taxa de cancelamento

| Campo | Valor |
|---|---|
| Fórmula | `COUNT(status='cancelado') / COUNT(*)` — denominador é **Total de pedidos** (todos os status), igual em Dashboard, Lojas e Cancelamentos |
| Dado ausente | `null` se não há nenhum pedido no recorte (evita `0/0`) |
| Implementação | `cancellationRate()` em `orders.ts:56`; a página `/cancelamentos` recalcula o mesmo racional manualmente (`cancelledOrders.length / totalOrdersCount`) em vez de chamar a função — mesmo resultado, código duplicado (ver inconsistência #3) |
| Onde aparece | Dashboard executivo, Comparação de lojas, Cancelamentos |

### Clientes únicos

| Campo | Valor |
|---|---|
| Fórmula | `COUNT(DISTINCT customer_id)` no período, ignorando pedidos sem cliente identificado |
| Status considerado | **Todos** (não filtra por concluído/cancelado) |
| Implementação | `uniqueCustomers()` em `orders.ts:89` |
| Onde aparece | Dashboard executivo, Comparação de lojas |

⚠️ Um cliente que só teve pedido **cancelado** no período ainda conta aqui. Documentado em METRICS.md como limitação ("pedidos sem cliente identificado ficam fora"), mas a inclusão de clientes com pedido só-cancelado não está explicitada em nenhum lugar — comportamento razoável, só precisa estar visível no tooltip.

### Clientes novos

| Campo | Valor |
|---|---|
| Definição | Clientes cuja **primeira compra em toda a história sincronizada** caiu dentro do período filtrado |
| Fórmula | `customerId ∈ período` E `MIN(ordered_at) histórico completo ∈ [período.start, período.end]` |
| Implementação | `newCustomersCount()` em `orders.ts:99`, alimentado por uma query separada `allTimeOrders` (sem filtro de período) em cada página que usa esse cálculo |
| Onde aparece | Dashboard executivo |
| Limitação real | Depende de todo o histórico já ter sido sincronizado — se a sincronização começou depois da abertura da loja, clientes antigos "somem" e reaparecem como "novos" na primeira compra pós-sincronização. Já documentado em METRICS.md. |

### Faturamento por loja

| Campo | Valor |
|---|---|
| Fórmula | Mesma `grossRevenue()` do faturamento bruto, aplicada por `store_id` |
| Implementação | `/lojas/page.tsx` — mesma função, mesma base de status, mesmo período — **consistente com o Dashboard** |
| Onde aparece | Comparação de lojas |

### Produtos mais vendidos

| Campo | Valor |
|---|---|
| Definição | Ranking de `order_items` por quantidade/faturamento |
| Fórmula | `SUM(quantity)` / `SUM(total_price)` agrupado por `original_name` |
| Status considerado | **Só `concluido`**, hardcoded dentro de `buildProductRanking()` (`item.order_status !== "concluido"` descarta o resto) — não configurável por filtro externo |
| Adicionais | Excluídos (`is_addon=true` descartado) |
| Implementação | `buildProductRanking()` em `src/lib/metrics/products.ts:24` |
| Onde aparece | Dashboard executivo, Produtos |

🔴 **Ver inconsistência #2** — a aba Produtos agora tem filtro de status/canal/tipo de retirada (sistema de filtros global), mas o ranking de produtos ignora esse filtro por causa do hardcode `concluido` interno.

## 2. Inconsistências encontradas

### #1 — Ticket médio usa uma base diferente do Faturamento bruto exibido ao lado

**Onde**: Dashboard executivo e Comparação de lojas, os dois cards lado a lado.

**Causa raiz**: `grossRevenue()` soma `gross_amount` de **todos os pedidos não cancelados** (inclui em andamento). `averageTicket()` soma `gross_amount` **só dos concluídos**. São numeradores diferentes calculados a partir do mesmo array de pedidos — por isso `Faturamento bruto / Total de pedidos ≠ Ticket médio`, e isso pode confundir quem está lendo o dashboard sem saber da diferença de base.

**Isso é bug ou decisão?** É uma decisão de produto razoável (ticket médio de pedido "em andamento" não faz muito sentido, só o concluído reflete venda de fato) — mas **não está comunicada na interface**. METRICS.md também escreve a fórmula de forma ambígua: `ticket_medio = faturamento_bruto / pedidos_concluidos`, o que sugere (incorretamente) que o numerador seria o mesmo "faturamento bruto" mostrado no card ao lado.

**Correção proposta (não aplicada)**: 
1. Adicionar tooltip no card "Ticket médio" explicando: "Calculado só sobre pedidos concluídos — diferente da base de Faturamento bruto, que inclui pedidos em andamento."
2. Corrigir a fórmula em METRICS.md para `SUM(gross_amount WHERE status='concluido') / COUNT(status='concluido')`, deixando explícito que não é o mesmo numerador do faturamento bruto.
3. **Alternativa mais profunda** (decisão de produto, não só de texto): considerar se "Faturamento bruto" do card principal deveria, na verdade, ser só de pedidos concluídos por padrão, com pedidos em andamento em um card separado ("Em andamento: R$ X em Y pedidos"). Essa mudança afetaria número exibido, por isso não a apliquei — só sinalizo como opção.

### #2 — Filtro de status/canal/tipo na aba Produtos não afeta o ranking de produtos

**Onde**: `/produtos`, introduzido no rollout do sistema de filtros global (commit `7ddf26c`).

**Causa raiz**: a query de pedidos na página aplica corretamente `.eq("status", filters.status)` quando o usuário escolhe um status — mas o resultado passa por `buildProductRanking()`, que **internamente descarta tudo que não seja `status='concluido'`**, independente do que a página já filtrou. Resultado: se o usuário escolhe qualquer status diferente de "Concluído" no filtro, os cards "Mais vendidos" e "Dias desde a última venda" ficam **vazios silenciosamente** — sem mensagem explicando por quê — enquanto o card "Pedidos do período" (que não passa por `buildProductRanking`) continua mostrando os pedidos normalmente. É exatamente o cenário "faturamento com uma base, outra métrica com outra, sem indicar".

**Correção proposta (não aplicada, para eu implementar mediante sua confirmação)**:
- Opção A: esconder o filtro de "Status" do `GlobalFilterBar` na aba Produtos (já que o ranking sempre é só-concluído por definição do indicador) e deixar isso explícito na descrição do card.
- Opção B: tornar `buildProductRanking()` respeitar o status que vier nos dados (parametrizar em vez de hardcoded), somando aviso "ranking de produtos vendidos só existe para pedidos concluídos" quando outro status é escolhido.
- Recomendo a Opção A — é a que não muda o significado do indicador "produtos mais vendidos" (que é inerentemente sobre venda concluída).

### #3 — Taxa de cancelamento calculada de duas formas equivalentes, mas duplicadas

**Onde**: `/cancelamentos` recalcula manualmente (`cancelledOrders.length / totalOrdersCount`) em vez de chamar `cancellationRate()` de `orders.ts`, usada em `/dashboard` e `/lojas`.

**Impacto real**: nenhum — o resultado numérico é idêntico (mesmo numerador, mesmo denominador). É uma duplicação de código, não uma divergência de dado.

**Correção proposta**: fazer `/cancelamentos` importar e usar `cancellationRate()` de `orders.ts`, eliminando a duplicação (risco baixo, refatoração pura, sem mudança de comportamento).

## 3. O que está consistente (verificado, sem achado)

- **Timezone**: todas as páginas resolvem o período via `resolvePeriod`/`resolveCustomPeriod` (`src/lib/dates/period.ts`), que usa `America/Sao_Paulo` de ponta a ponta. Nenhuma página calcula limite de dia com outro fuso.
- **Faturamento por loja vs. Dashboard**: mesma função, mesmo filtro de status, mesmo período — sem divergência.
- **Cancelados nunca entram em Faturamento bruto/líquido** em nenhuma tela.
- **Descontos e taxas de entrega** são somas diretas e reais (`discountsTotal`/`deliveryFeesTotal`), nunca deduzidos do faturamento bruto em nenhuma tela — consistente com METRICS.md.
- **"Dado indisponível" vs. zero**: `netRevenue()` e `averageTicket()`/`cancellationRate()` retornam `null` explicitamente quando não há base de cálculo, e a UI checa esse `null` antes de formatar — não vira `R$ 0,00` por engano em nenhum dos casos revisados.

## 4. O que fica para decisão sua

- Se quer que eu aplique a correção #2 (Opção A) agora.
- Se quer que eu corrija a fórmula do Ticket médio em METRICS.md e adicione o tooltip explicativo (recomendo sim, é só documentação + UI, sem mudar número).
- Se quer que eu unifique a duplicação #3 (baixo risco).
- Se a "alternativa mais profunda" do achado #1 (separar faturamento concluído de em-andamento) é algo que você quer perseguir — essa sim muda o número exibido, preciso de confirmação explícita antes.
