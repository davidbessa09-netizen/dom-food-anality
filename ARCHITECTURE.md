# ARCHITECTURE.md — DOM Food Analytics

## 1. Visão geral

DOM Food Analytics é um sistema de BI multi-loja/multi-marca/multi-plataforma para
sete operações de alimentação (Gulas, Nikô Sushi Palhoça, Nikô Sushi Floripa,
Kings Chicken — todos via Anota AI — e três lojas iFood). O objetivo é centralizar
pedidos, produtos, clientes e (quando disponível) eventos de navegação do cardápio,
para gerar métricas, diagnósticos e recomendações — **nunca inventando dados que a
plataforma de origem não fornece**.

Duas regras de arquitetura vêm antes de qualquer stack ou tabela:

1. **Honestidade de dados**: todo indicador exibido precisa ser classificável como
   `real` (veio direto da fonte), `calculado` (derivado de dados reais, ex.: taxa de
   cancelamento) ou `estimado` (inferência com incerteza, ex.: matriz de diagnóstico
   de produto). A UI deve mostrar essa classificação. Quando o dado simplesmente não
   existe, mostrar "dado indisponível" — nunca um placeholder que pareça número real.
2. **Isolamento por adaptador**: nenhuma tela ou métrica fala diretamente com Anota AI
   ou iFood. Tudo passa por um `SourceAdapter` que converte o formato de origem em um
   modelo interno canônico. Trocar de fonte (API → CSV → API novamente) nunca deve
   exigir mudança fora da camada de adaptadores.

## 2. Stack

| Camada            | Escolha                                         | Motivo |
|-------------------|--------------------------------------------------|--------|
| Framework         | Next.js 15 (App Router) + TypeScript              | SSR/RSC para dashboards pesados de dados, rotas de API para webhooks/CRON |
| UI                | Tailwind CSS v4 + shadcn/ui (Radix)               | Componentes acessíveis, consistentes, customizáveis sem lock-in de design system |
| Gráficos          | Recharts                                          | Composição declarativa em React, suficiente para os gráficos pedidos |
| Tabelas           | TanStack Table                                    | Ordenação/filtro/paginação client-side para rankings e drill-down |
| Validação         | Zod                                               | Schemas compartilhados entre formulários, importação CSV e payloads de webhook |
| Banco             | PostgreSQL via Supabase                           | RLS nativo por linha resolve o isolamento de organização/marca/loja sem código extra de autorização |
| Acesso a dados    | Supabase SDK (client) nas rotas de servidor + Prisma **não usado** | Decisão abaixo |
| Autenticação      | Supabase Auth                                     | Sessão + RLS integrados, sem servidor de auth separado |
| Jobs agendados    | Supabase Scheduled Functions / Edge Functions + rota `/api/cron/*` protegida por secret | Sincronização periódica de integrações |
| Testes            | Vitest + Testing Library                          | Rápido, roda nativamente em TS/ESM do Next |

### 2.1 Prisma vs. Supabase SDK — decisão

O pedido permitia escolher uma abordagem. Optamos por **Supabase SDK direto** (sem
Prisma) porque:

- RLS é a linha de defesa principal de multi-tenancy deste sistema (um gestor do
  Nikô Palhoça não pode ver dados do Gulas). Prisma não fala com RLS de forma
  transparente — normalmente exige desligar RLS e replicar as regras de autorização
  em código, o que duplica a lógica de segurança e cria risco de vazamento de dados
  entre marcas.
- O SQL do schema (`supabase/schema.sql`) é a fonte de verdade; tipos TypeScript são
  gerados via `supabase gen types typescript`, cobrindo o que o Prisma Client
  ofereceria em termos de tipagem, sem duplicar o modelo em `schema.prisma`.
- Menos uma camada de sincronização (migrations do Prisma vs. migrations SQL do
  Supabase) para manter consistente.

Caso o projeto cresça para exigir queries relacionais muito complexas fora do que
views/RPCs do Postgres resolvem bem, essa decisão pode ser revisitada — mas não na
Fase 1–4.

## 3. Estrutura de pastas

```
dom-food-analytics/
├── src/
│   ├── app/
│   │   ├── (auth)/login, /recuperar-senha
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/                 # executivo
│   │   │   ├── lojas/                     # comparação de lojas
│   │   │   ├── vendas/
│   │   │   ├── produtos/
│   │   │   ├── jornada/
│   │   │   ├── clientes/
│   │   │   ├── categorias/
│   │   │   ├── combos/
│   │   │   ├── cancelamentos/
│   │   │   ├── alertas/
│   │   │   ├── recomendacoes/
│   │   │   ├── bairros/
│   │   │   ├── integracoes/
│   │   │   ├── importacoes/
│   │   │   ├── correspondencia-produtos/
│   │   │   ├── qualidade-dados/
│   │   │   ├── sincronizacoes/
│   │   │   ├── configuracoes/
│   │   │   └── usuarios/
│   │   └── api/
│   │       ├── webhooks/{anota-ai,ifood}/route.ts
│   │       ├── cron/sync/route.ts
│   │       └── track/route.ts             # SDK de eventos do cardápio próprio
│   ├── components/
│   │   ├── ui/                            # shadcn primitives
│   │   ├── charts/                        # wrappers Recharts padronizados
│   │   └── dashboard/                     # filtros globais, cards de métrica, etc.
│   ├── lib/
│   │   ├── supabase/{client,server,middleware}.ts
│   │   ├── integrations/
│   │   │   ├── types.ts                   # NormalizedOrder, NormalizedProduct, etc.
│   │   │   ├── base-adapter.ts            # interface SourceAdapter
│   │   │   ├── anota-ai/adapter.ts
│   │   │   ├── ifood/adapter.ts
│   │   │   ├── csv-import/adapter.ts
│   │   │   └── event-tracking/adapter.ts
│   │   ├── metrics/                       # funções puras de cálculo (testáveis)
│   │   ├── auth/                          # helpers de sessão/perfil/permissão
│   │   └── validations/                   # schemas Zod
│   └── types/                             # tipos gerados do banco + domínio
├── supabase/
│   ├── schema.sql
│   ├── migrations/
│   └── seed/demo-data.sql
├── tests/
├── ARCHITECTURE.md, DATABASE.md, INTEGRATIONS.md, METRICS.md, SECURITY.md,
│   IMPORT_GUIDE.md, DEPLOYMENT.md
└── .env.example
```

## 4. Arquitetura de integração (adaptadores)

```
                     ┌─────────────────────────┐
                     │   Fonte externa real     │
                     │ (Anota AI API / iFood API│
                     │  / arquivo CSV / SDK JS) │
                     └────────────┬─────────────┘
                                  │ dados no formato da fonte
                                  ▼
                     ┌─────────────────────────┐
                     │      SourceAdapter       │  ← interface única
                     │ .fetchOrders()           │
                     │ .fetchProducts()         │
                     │ .fetchCustomers()        │
                     │ .fetchCancellations()    │
                     └────────────┬─────────────┘
                                  │ NormalizedOrder / NormalizedProduct / ...
                                  ▼
                     ┌─────────────────────────┐
                     │   Sync Engine            │
                     │  - dedup por (platform,  │
                     │    external_id, store)   │
                     │  - grava sync_logs        │
                     │  - grava payload bruto    │
                     │    em raw_payload (jsonb) │
                     └────────────┬─────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │   PostgreSQL (Supabase)  │
                     │  orders, order_items,    │
                     │  customers, products...  │
                     └─────────────────────────┘
```

### 4.1 Interface comum

```ts
interface SourceAdapter {
  readonly platform: 'anota_ai' | 'ifood' | 'csv_import' | 'event_tracking'
  readonly connectorVersion: string

  testConnection(credentials: IntegrationCredentials): Promise<ConnectionStatus>

  fetchOrders(params: SyncCursor): Promise<NormalizedOrder[]>
  fetchProducts(params: SyncCursor): Promise<NormalizedProduct[]>
  fetchCustomers(params: SyncCursor): Promise<NormalizedCustomer[]>
  fetchCancellations(params: SyncCursor): Promise<NormalizedCancellation[]>
}
```

Cada registro normalizado carrega os campos de proveniência exigidos:
`source_platform`, `source_external_id`, `store_id`, `synced_at`, `source_updated_at`,
`sync_status`, `raw_payload` (jsonb, quando a plataforma permitir reter o payload),
`connector_version`.

### 4.2 Idempotência

A chave de deduplicação é `(store_id, source_platform, source_external_id)` com
constraint `UNIQUE` no banco. Toda gravação de pedido é um `upsert` sobre essa chave.
Reprocessar uma sincronização é sempre seguro.

### 4.3 Sync Engine

- **Cursor de sincronização**: cada integração guarda `last_synced_at` /
  `last_cursor` em `integrations`. A cada rodada, busca apenas registros novos ou
  atualizados desde o cursor.
- **Backoff**: falhas de rede/rate-limit acionam retry exponencial (1min, 5min,
  30min, 2h, depois marca `sync_jobs.status = 'failed'` e para).
- **Sync manual**: botão na tela de Integrações dispara `POST /api/sync/:integrationId`.
- **Sync automática**: rota de CRON (`/api/cron/sync`) protegida por header secret,
  chamada por um scheduler externo (Supabase Cron / Vercel Cron).
- **Histórico**: toda execução gera uma linha em `sync_jobs` (resumo) e N linhas em
  `sync_logs` (detalhe por erro/registro problemático).
- **Reprocessamento**: tela de Sincronizações lista jobs com falha e permite
  "Reprocessar", que dispara nova execução a partir do mesmo cursor (não avança o
  cursor em caso de falha total).

## 5. Autenticação e autorização

- Supabase Auth (email/senha) para login.
- Perfis: `admin_geral`, `gestor_marca`, `gestor_loja`, `analista`, `somente_leitura`.
- Tabela `user_organizations` associa usuário → organização com um `role` e,
  opcionalmente, escopo restrito a `brand_id`/`store_id` específicos.
- **Row Level Security** em todas as tabelas com dados de negócio: as policies
  verificam se o usuário tem vínculo ativo com a `organization_id`/`brand_id`/
  `store_id` da linha, via função `auth.user_has_store_access(store_id)` (`SECURITY
  DEFINER`, ver `supabase/schema.sql`).
- Nenhuma query do frontend usa a `service_role key`. Rotas de servidor que
  precisarem de acesso elevado (ex.: importação em lote, jobs de sync) rodam em
  `route handlers`/Edge Functions com a service key **apenas no ambiente de
  servidor**, nunca exposta ao client.

## 6. Drill-down

Todas as métricas de cards/gráficos carregam metadados de dimensão
(`organization → brand → store → channel → category → product → order`), permitindo
que o clique em qualquer nível aplique um filtro adicional e navegue para o nível
seguinte, reaproveitando os mesmos componentes de filtro global.

## 7. Fuso horário e localização

- Todo timestamp é armazenado em UTC (`timestamptz`) no banco.
- Toda exibição e todo agrupamento por dia/hora usa `America/Sao_Paulo`
  (`date-fns-tz`), tanto no cálculo de métricas diárias quanto nos filtros de
  período ("Hoje", "Este mês" etc. são calculados no fuso de São Paulo).
- Idioma da interface: português do Brasil em 100% das telas.

## 8. Dados de demonstração vs. dados reais

- Toda organização criada via seed de demonstração tem `is_demo = true`.
- Um middleware de UI exibe uma faixa "DEMONSTRAÇÃO" fixa quando
  `organization.is_demo = true`.
- Existe uma ação administrativa única (`DELETE /api/admin/demo-data`) que apaga
  em cascata todas as linhas vinculadas a organizações demo — nunca mistura com
  dados reais porque a filtragem é por `organization_id`, isolada por RLS.

## 9. O que NÃO fizemos (e por quê)

- Não implementamos scraping de Anota AI/iFood. Se não houver API documentada com
  credenciais legítimas, o caminho é sempre importação CSV/Excel.
- Não geramos números de funil (visualizações, cliques, abandono de checkout)
  quando a fonte é só de pedidos. Ver `INTEGRATIONS.md` e a regra de "funil parcial".
- Não usamos Prisma (ver seção 2.1).
