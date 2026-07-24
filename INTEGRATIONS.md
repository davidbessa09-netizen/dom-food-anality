# INTEGRATIONS.md — Integrações e checklist de credenciais

## 1. Estado real das integrações (a verificar antes de codar)

Nenhum código de integração com Anota AI ou iFood foi escrito ainda. Antes da
Fase 3, é obrigatório:

1. Consultar a documentação oficial de parceiro/API de cada plataforma.
2. Confirmar com a própria plataforma (ou seu gerente de conta) se sua conta tem
   acesso a uma API de parceiro — muitas redes de delivery só liberam API
   mediante cadastro comercial como parceiro técnico, não é algo self-service.
3. Listar exatamente quais endpoints/campos estão disponíveis para sua conta.
4. Nunca supor que um endpoint existe porque "faz sentido existir".

**Anota AI**: é uma plataforma de cardápio digital/gestão de pedidos usada por
restaurantes; possui integrações via parceiros homologados. Antes de implementar
`AnotaAIAdapter` de verdade, é necessário: (a) confirmar com o suporte/parceria
comercial da Anota AI se existe API/webhook disponível para a sua conta, (b)
obter a documentação técnica oficial, (c) obter as credenciais abaixo.

**Progresso confirmado em 2026-07-22** (verificado via documentação pública e
resposta real da API, sem usar nenhum token real em nenhum teste):

- Documentação pública: `https://anota-ai.stoplight.io/` (seções "API de
  Pedidos" e "API Cardápio"). É renderizada em JS (Stoplight) — precisa ser
  aberta em navegador, não é raspável por fetch simples.
- Portal de Integração (cadastro de parceiro/desenvolvedor, separado da conta
  do lojista): `https://integracao.anota.ai/login`.
- Fluxo de obtenção de token, conforme a própria documentação da Anota AI:
  1. Lojista pega o "ID da loja" + "Chave de integração (Token)" no admin dele
     (`Configuração Geral → Integrações`).
  2. O integrador (nós) precisa de uma conta no Portal de Integração
     (`integracao.anota.ai`) — parece ser cadastro de desenvolvedor,
     possivelmente autoatendimento (a confirmar).
  3. Dentro do portal, adiciona-se a loja usando o token/ID do passo 1.
  4. O portal gera um **token novo, específico da integração**, que é o que
     efetivamente vai no header das chamadas à API de pedidos/cardápio.
  5. O token bruto do passo 1, sozinho, **não autentica diretamente** no
     endpoint de API testado abaixo — confirmado por teste real (ver adiante).
- URL base real da API, confirmada por teste de comportamento (não documentada
  publicamente que encontramos, mas responde de fato):
  `https://api-parceiros.anota.ai`
- Endpoint `POST /partnerauth` existe e está ativo. Testado (sem usar token
  real, só para mapear o formato de erro):
  - Sem header → `{"success":false,"err":"No token provided."}`
  - Header `Authorization: Bearer <valor>` → reconhecido (erro muda para
    `"Failed to authenticate token."`), inclusive com o token real da loja do
    usuário — confirma que esse endpoint espera autenticação de **parceiro**
    (do portal), não o token bruto do lojista.
  - Headers `token:` e `x-access-token:` → não reconhecidos.
- **Atualização 2026-07-23** — conta de parceiro já criada e estabelecimento
  já cadastrado no Portal de Integração. Estrutura real confirmada por
  captura de tela do próprio portal (`integracao.anota.ai`):
  - Nível parceiro (tela inicial, após login): `CLIENT_ID` e `CLIENT_SECRET`
    — usados presumivelmente em `POST /partnerauth` (a confirmar o formato
    exato do corpo/resposta).
  - Nível estabelecimento (ao clicar em um estabelecimento cadastrado, ex.
    "Niko Sushi Floripa"):
    - `Root`: identificador do estabelecimento dentro do Portal (formato
      parecido com ObjectId Mongo, ex. `54cefcb0651c90011a5cdc6`).
    - `Token`: um JWT — este é o token que deve autenticar as chamadas de
      pedidos/cardápio **desse estabelecimento específico** (ainda não
      testamos contra os endpoints reais de pedidos/cardápio).
    - `ID Externo do Restaurante`: campo vazio para nós preenchermos com
      nosso próprio identificador interno da loja (mapeamento
      `sales_channels.external_store_id`).
    - **Webhooks**, configuráveis por estabelecimento, cada um com escolha
      de método HTTP (POST ou PUT):
      - Pedidos Realizados
      - Pedidos Atualizados
      - Pedidos Cancelados
    - `Token Externo`: campo de texto ao lado dos webhooks — hipótese (não
      confirmada) é que seja um segredo que nós definimos e a Anota AI
      devolve junto de cada chamada de webhook, para validarmos a
      autenticidade da chamada.
  - **Ainda não identificado**: nenhum campo de URL de callback/destino do
    webhook nessa tela — pode estar configurado em outro lugar (nível
    parceiro, ou no cadastro inicial da conta de desenvolvedor). Pendente de
    confirmação.
  - ⚠️ Nota de segurança: o `CLIENT_SECRET` e o `Token` (JWT) desse
    estabelecimento apareceram em capturas de tela compartilhadas durante o
    levantamento — considerar esses valores potencialmente expostos e gerar
    novos antes de ir para produção.
- **Atualização 2026-07-23 (2)** — texto oficial da seção "Sobre a API" da
  documentação (`anota-ai.stoplight.io`), colado integralmente pelo usuário:
  - **Autenticação**: header `Authorization: {token}` — o valor do token vai
    puro no header (a doc não menciona prefixo `Bearer`). Precisa validar na
    prática se um prefixo `Bearer ` quebra a autenticação ou é tolerado.
  - **Content-Type**: `application/json` em request e response.
  - **Formato de data/hora**: ISO 8601 com milissegundos e `Z`, ex.
    `2022-02-03T16:26:22.531Z`.
  - **Webhooks**: cadastrados na área específica do Portal de Integração
    (bate com a tela já vista) — narrativamente a doc só menciona "novos
    pedidos" e "cancelamento de pedidos", mas a tela do portal mostra 3
    eventos (Realizados, Atualizados, Cancelados); a doc pode estar
    desatualizada ou simplificada.
  - **Polling (mecanismo alternativo/complementar ao webhook)** — pensado
    para o integrador não perder eventos:
    - `PING - LIST ORDERS`: chamado a cada ~30s. Retorna lista paginada de
      pedidos com apenas `_id` e `check` (status resumido). Exemplo de
      resposta:
      ```json
      {
        "success": true,
        "info": {
          "docs": [{ "_id": "62139e3a588f440012c742e8", "check": 0 }],
          "count": 1,
          "limit": 100,
          "currentpage": 1
        }
      }
      ```
      - Paginação via query param `currentpage` (default 1), 100 registros
        por página (`limit`).
      - Filtros combináveis via query: `inAnalysis=true`, `inProduction=true`,
        `inFinished=true` (sem filtro = todos os status). Ex. de path
        relativo mostrado na doc: `ping/list?inAnalysis=true`.
      - Valores de `check`: `0` Em análise, `1` Em produção, `2` Pronto,
        `3` Finalizado, `4` Cancelado, `5` Negado, `6` Solicitação de
        cancelamento de pedido.
    - `PING - GET ORDER`: busca o objeto completo do pedido a partir do
      `_id` retornado pelo LIST.
  - Esse modelo de polling paginado por cursor (`currentpage` + filtro por
    status) encaixa diretamente no `Sync Engine` já desenhado em
    `ARCHITECTURE.md` §4.3 (cursor de sincronização, backoff, sync_jobs) —
    é o caminho mais robusto pra Fase 3, mais do que depender só de webhook.
- **Atualização 2026-07-23 (3)** — endpoints confirmados contra o servidor
  mock oficial (`https://stoplight.io/mocks/anota-ai/api-de-pedidos/444207731`,
  sem usar nenhum token real):
  - `GET /ping/list` — path real confirmado. Sem header `authorization` →
    erro de validação exigindo o header. Com qualquer valor no header,
    devolve o exemplo do schema:
    ```json
    {"success":true,"info":{"docs":[{"_id":"string","check":0,"from":"string","salesChannel":"string","updatedAt":"string"}],"count":0,"limit":0,"currentpage":0}}
    ```
    (Note: o schema real do item da lista inclui também `from` e
    `salesChannel`/`updatedAt`, não só `_id`/`check` como a doc narrativa
    dava a entender.)
  - `GET /ping/get/:orderId` — path real confirmado (mesma validação de
    header). Mock não gerou exemplo de corpo pra essa rota especificamente,
    mas o payload completo abaixo (colado da documentação) é a referência.
  - Header exigido é `authorization` (case-insensitive, padrão HTTP) — bate
    com "Sobre a API": `Authorization: {token}`.
  - Base URL efetiva para esses dois endpoints: `https://api-parceiros.anota.ai`
    (a menção a `/partnerauth` como "URL base de todas as requisições" na
    doc narrativa parece ser um erro de cópia/cola da documentação — os
    paths reais são anexados direto à raiz, não a `/partnerauth`).
  - **Assunção a validar**: o token usado no header `authorization` é o
    token **por estabelecimento** (o JWT visto na tela do Portal), não o
    par `CLIENT_ID`/`CLIENT_SECRET` do parceiro nem uma troca via
    `/partnerauth`. Pendente de confirmação com uma chamada real (o usuário
    testará com curl usando o token do estabelecimento, sem compartilhar o
    valor).

### Schema completo do objeto de pedido (`GET /ping/get/:orderId`)

Copiado integralmente da documentação oficial (`anota-ai.stoplight.io`,
página "Order model"):

**Campos de nível superior**: `_id`/`id` (identificador), `check` (status,
ver tabela abaixo), `additionalFees[]`, `customer`, `deliveryFee`,
`discounts[]`, `items[]`, `menu_version`, `merchant`, `observation`,
`payments[]`, `pdv`, `preparationStartDateTime`, `qr_description`,
`salesChannel`, `shortReference` (número do pedido), `total`, `type`
(`TAKE`/`DELIVERY`/`LOCAL`), `ifood_id` (só se o pedido vier do iFood),
`createdAt`, `updatedAt`, `order_automatic_accept`.

**`check` (status do pedido)**: `-2` Agendado aceito, `0` Em análise,
`1` Em produção, `2` Pronto, `3` Finalizado (concluído), `4` Cancelado,
`5` Negado (não aceito em 15 min), `6` Solicitação de cancelamento.

**`customer`**: `id`, `name`, `phone`, `taxPayerIdentificationNumber` (CPF/CNPJ).

**`deliveryAddress`** (endereço, quando aplicável): `formattedAddress`,
`country`, `state`, `city`, `coordinates {latitude, longitude}`,
`neighborhood`, `streetName`, `streetNumber`, `postalCode`, `reference`,
`complement`, mais 3 campos só para pedidos de origem iFood
(`ifood_pickup_code`, `ifood_return_code`, `ifood_verification_code`).

**`discounts[]`**: `amount`, `tag`.

**`additionalFees[]`**: `type` (ex.: `waiter_tip`, `addition_pol`),
`description`, `value`.

**`items[]`**: `_id`, `id`, `name`, `quantity`, `externalId` (referência
externa — relevante para `product_variants.source_external_id`),
`internalId`, `price`, `total`, `subItems[]`.

**`subItems[]`** (adicionais/complementos do item): `name`, `quantity`,
`totalPrice`, `unitPrice`, `new_totalPrice`, `new_unitPrice`,
`externalCode`, e — só quando o item é pizza — `quantityFraction`,
`valueFraction`.

**`merchant`**: `id`, `name`, `unit` (identificador da unidade no Anota AI).

**`payments[]`**: `name`/`code` (ver lista de valores possíveis abaixo),
`value`, `cardSelected`, `externalId`, `changeFor`, `prepaid` (boolean —
`true` = pagamento online).

Valores possíveis de `name`/`code` em `payments`: `money`, `card`, `online`,
`online_credit`, `pix`, `debit`, `pix-ifood`, `online_tuna`,
`ifood-online-credit-payin`, `ifood-online-pix-payin`,
`tuna_nupay_credit`, `tuna_nupay_debit`, `tuna_wallet_credit`,
`tuna_wallet_debit`, `tuna_minimal_payment_link`,
`ifood-pago-credit-pinpad`, `ifood-pago-debit-pinpad`,
`ifood-pago-pix-pinpad`; para Totem/iFood integrado, adicionalmente:
`online-credit-ifood`, `online-debit-ifood`, `online-meal-voucher-ifood`,
`online-food-voucher-ifood`, `online-wallet-ifood`, `ifood-pago-credit`,
`ifood-pago-debit`, `ifood-pago-pix`, `ifood-pago-voucher`.

**`pdv`**: `status` (boolean — pedido veio do PDV), `mode` (1=Garçom,
2=Operador), `table`, `ticket`.

Payload completo de exemplo está registrado em
`supabase/seed/anota-ai-sample-order.json` (a criar junto com o adaptador,
para uso em testes).

- **Próximo passo pendente**:
  1. Confirmar onde se configura a URL de destino do webhook (fora do
     self-service do portal, possivelmente só via suporte).
  2. Confirmar formato exato de `POST /partnerauth` (corpo e resposta) e o
     significado de "Token Externo" — necessário só se formos depender de
     webhook; **não bloqueia** implementar o polling (`ping/list` +
     `ping/get`), que já tem tudo confirmado.
  3. Confirmar com uma chamada real (curl do usuário, sem compartilhar o
     token) que o token do estabelecimento autentica em `GET /ping/list`.
  4. Implementar o `AnotaAIAdapter.fetchOrders()` via polling PING, mapeando
     `check` → `OrderStatus` interno (ver tabela de mapeamento em
     `src/lib/integrations/anota-ai/adapter.ts` quando criado); webhook fica
     como melhoria complementar de tempo real, não bloqueante.

**iFood**: possui o **iFood Portal do Parceiro / iFood API** (Merchant API,
Order API, Financial API) para integradores homologados, o que normalmente exige
cadastro no programa de parceiros técnicos do iFood. Antes de implementar
`IFoodAdapter` de verdade: (a) confirmar se suas lojas/CNPJ têm acesso liberado
à API de parceiros, (b) obter credenciais OAuth, (c) confirmar quais endpoints
(pedidos, catálogo, financeiro, disputas/cancelamentos) estão no seu plano de
acesso.

**Enquanto essas confirmações não acontecerem, a única via de dados é
importação de CSV/Excel** exportado manualmente de cada painel (Anota AI e
iFood Portal do Parceiro geralmente permitem exportar relatórios de pedidos).
O `CSVImportAdapter` é, portanto, o adaptador prioritário e é o que a Fase 2
implementa de fato.

## 2. Checklist do que solicitar

### Para a Anota AI (via suporte/conta comercial)
- [ ] Existe API ou webhook de pedidos disponível para sua conta/plano?
- [ ] Documentação técnica oficial (URL, formato de autenticação).
- [ ] Quais dados o endpoint de pedidos retorna (status, itens, cliente, forma
      de pagamento, taxa de entrega, desconto, motivo de cancelamento)?
- [ ] Existe endpoint de catálogo/produtos e categoria?
- [ ] Existe identificador estável de cliente entre pedidos (para reconhecer
      recorrência)?
- [ ] É possível exportar relatórios em CSV/Excel pelo painel, e com quais
      colunas, como alternativa enquanto a API não estiver liberada?
- [ ] Política de uso de dados — quais dados podem ser armazenados/retidos.
- [ ] Escopos/permissões necessários por tipo de credencial (leitura de pedidos
      vs. escrita/gestão de cardápio).

### Para o iFood (Portal do Parceiro / iFood API)
- [ ] Confirmar elegibilidade ao programa de parceiros técnicos para as 3 lojas.
- [ ] Credenciais: `client_id` / `client_secret` (fluxo OAuth2 client credentials
      é o modelo usual do iFood — confirmar na documentação vigente).
- [ ] Quais módulos estão liberados: Merchant (catálogo/status da loja), Order
      (pedidos e eventos de pedido), Financial (repasses/taxas), Review.
- [ ] Formato dos webhooks de eventos de pedido (criação, confirmação,
      cancelamento) e como validar a assinatura do webhook.
- [ ] Exportação manual de relatórios pelo Portal do Parceiro como fallback.
- [ ] Motivo de cancelamento é exposto pela API/relatório, ou só um código?

### Internas (independente da plataforma)
- [ ] Definir, junto ao time, se cardápios próprios (fora do Anota AI/iFood)
      existem e podem receber o SDK de rastreamento de eventos.
- [ ] Autorização formal para inserir o script de tracking, se aplicável.
- [ ] Política de retenção de dados de cliente (LGPD) aprovada antes de
      armazenar qualquer identificador pessoal, mesmo mascarado.
- [ ] Vault/gerenciador de segredos escolhido para guardar tokens (nunca em
      texto plano no banco ou repositório).

## 3. Regra crítica do funil (reforçada)

Se, ao final do checklist acima, Anota AI e iFood só expuserem **pedidos**
(criação, confirmação, cancelamento) e não eventos de navegação (visualização de
cardápio, cliques, adição ao carrinho, abandono de checkout), o sistema:

- Mostra apenas as etapas observáveis diretamente de `orders`
  (pedido criado → confirmado → concluído/cancelado).
- Rotula a análise como **"Funil parcial"** de forma visível na tela.
- Lista explicitamente quais etapas não têm rastreamento disponível.
- Oferece uma tela de instruções para ativar o SDK de rastreamento próprio,
  caso a loja tenha um cardápio próprio fora do Anota AI/iFood onde isso seja
  tecnicamente viável e autorizado.
- Nunca preenche visualizações, cliques, adições ao carrinho ou tempo em página
  com números calculados/estimados a partir de pedidos.

## 3.1 Complemento de funil via Meta Pixel (agregado, não por sessão)

O cardápio hospedado pela Anota AI tem um campo específico "Pixel do Facebook"
(não um campo genérico de script) — confirmado em 2026-07-23 com o usuário.
Isso significa que **não é possível injetar nosso próprio `EventTrackingAdapter`
SDK ali**; só a Meta recebe os eventos do Pixel diretamente.

Alternativa real e viável: puxar as **contagens agregadas diárias** dos
eventos padrão do Pixel (ViewContent, AddToCart, InitiateCheckout, Purchase)
via Meta Ads/Business Manager, usando o conector `facebook` já disponível no
Windsor.ai. Isso complementaria o funil parcial com dados de topo de funil —
sempre rotulado como "agregado por dia via Meta Ads", nunca misturado com os
dados por pedido, já que não é possível cruzar por cliente/sessão individual.

- Conta Meta Ads já conectada no Windsor.ai (contas: "Nicolle Bachtold",
  "1247127822605371").
- Campos confirmados (existem de verdade no schema do conector `facebook`):
  `actions_offsite_conversion_fb_pixel_view_content`,
  `actions_offsite_conversion_fb_pixel_add_to_cart`,
  `actions_offsite_conversion_fb_pixel_initiate_checkout`,
  `actions_offsite_conversion_fb_pixel_purchase` (e os equivalentes
  `action_values_...` para valor monetário).
- **Bloqueado no momento**: a conta Windsor.ai está no plano gratuito e tem
  mais contas conectadas do que o plano permite — a API retorna aviso de
  limite em vez de dados. Precisa de upgrade do plano (windsor.ai/app/pricing)
  ou desconectar contas excedentes antes de tentar de novo.
- Decisão do usuário em 2026-07-23: deixar para depois — funil parcial
  baseado em status de pedido continua sendo a única fonte de jornada por ora.

## 3.2 Limitação conhecida: `ping/list` não é um histórico

Verificado ao vivo em 2026-07-24: `GET /partnerauth/ping/list` (sem filtro)
parece expor apenas uma fila de pedidos "ativos" (em análise/produção/
recém-finalizados) — não um histórico completo por data. Uma vez que um
pedido é finalizado e passa um tempo, ele some da lista, mesmo sem nenhum
filtro de status aplicado.

**Incidente real**: o poller local (Windows Scheduled Task a cada 10 min,
depende do `npm run dev` estar rodando) ficou parado por ~18h30 (23/07 18:55
até 24/07 10:24, provavelmente PC desligado/suspenso durante a noite). Ao
retomar, `ping/list` já retornava `docs: []` para Kings Chicken, Nikô Sushi
Floripa e Nikô Sushi Palhoça — os pedidos do dia 23/07 dessas 3 lojas
já tinham saído da fila e **não há como recuperá-los retroativamente** via
API (não existe endpoint de listagem por intervalo de data — só
`ping/list`, que é a fila ativa, e `ping/get/:orderId`, que exige já ter o
ID). Testado também o header `x-merged-table` (true/1/vazio) sugerido pelo
usuário — não alterou o resultado.

**Decisão do usuário em 2026-07-24**: aceitar a perda desses pedidos
específicos (não inventar/estimar dados). O sistema não mostra números
fictícios para esse período — a ausência de registro é a representação
honesta do que a API permite recuperar.

**Mitigação real**: a causa raiz é o poller depender de uma máquina local
que liga/desliga, não a lógica de sincronização em si. A correção
definitiva é rodar o cron em um ambiente sempre ativo (deploy — ver Fase 6
em `ARCHITECTURE.md`), não apenas aumentar a frequência do polling local.

## 4. Adaptadores

| Adaptador | Fase | Status |
|---|---|---|
| `CSVImportAdapter` | 2 | A implementar primeiro — único caminho garantido de dados sem depender de aprovação de API externa |
| `AnotaAIAdapter` | 3 | Bloqueado até checklist da seção 2 ser respondido |
| `IFoodAdapter` | 3 | Bloqueado até checklist da seção 2 ser respondido |
| `EventTrackingAdapter` (SDK próprio) | 5 | Só relevante se existir cardápio próprio autorizado a receber o script |

Interface comum documentada em `ARCHITECTURE.md`, seção 4.
