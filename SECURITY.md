# SECURITY.md

## Princípios

- Nenhum token, API key ou service role key vive no bundle do frontend.
  Toda chamada que exige credencial elevada roda em Route Handlers/Server
  Actions no Next.js (execução em servidor).
- Variáveis públicas usam o prefixo `NEXT_PUBLIC_` (apenas URL do Supabase e
  chave anônima, que já é segura para exposição por design do Supabase, pois
  RLS controla o acesso real). Toda outra credencial fica sem esse prefixo.
- Credenciais de integração (Anota AI, iFood) nunca são gravadas em texto
  plano: `integration_credentials.encrypted_value` guarda o token cifrado com
  AES-256-GCM (`src/lib/security/crypto.ts`), usando `CREDENTIALS_ENCRYPTION_KEY`
  (só existe no servidor). O campo `secret_ref` (referência a um vault externo)
  existe no schema para uma evolução futura, mas não é o caminho usado hoje —
  o valor real do token nunca entra em coluna de texto plano nem aparece em log.
- Webhooks (Anota AI/iFood, quando existirem) são validados por assinatura
  (HMAC ou verificação do header do provedor) antes de qualquer gravação —
  nunca confiamos em payload de webhook sem validação de origem.
- Rate limiting nas rotas públicas de API (`/api/webhooks/*`, `/api/track`) via
  limite por IP/token na camada de Route Handler.
- Logs de auditoria (`audit_logs`) registram ação, ator, entidade e timestamp —
  nunca o conteúdo de credenciais.
- Rotas protegidas: todo route handler sob `/api/*` que não seja webhook público
  exige sessão Supabase válida; middleware do Next verifica sessão antes de
  liberar qualquer rota do grupo `(dashboard)`.
- RLS é a política de acesso primária (ver `DATABASE.md`, seção 11) — controle
  de acesso não depende de checagem correta no código de UI.

## LGPD

- Minimização: só armazenamos identificador de cliente quando a fonte o
  fornece; nunca inferimos CPF/endereço completo.
- Mascaramento: `customers.phone_masked`/`email_masked` são os únicos campos
  exibidos na UI; hashes (`phone_hash`/`email_hash`) servem só para
  deduplicação, nunca exibidos.
- Direito à exclusão/anonimização: **ainda não implementado** — não existe
  rotina/tela que substitua `full_name`/`phone_masked`/`email_masked` por
  anonimização irreversível. Necessário antes de tratar o sistema como
  compatível com pedidos de exclusão de titular (LGPD art. 18).
- Retenção: política default sugerida de 24 meses para dados pessoais de
  cliente identificável, configurável por organização — **ainda não
  implementada como rotina automática**, é só uma diretriz a decidir com o
  responsável pelo tratamento de dados da empresa.
- Auditoria: a tabela `audit_logs` existe no schema e tem RLS habilitado, mas
  **nenhum código da aplicação grava nela ainda** — nenhuma tela ou action
  atual registra acesso/exportação de dado de cliente. Isso é uma lacuna
  conhecida, não um recurso em produção; implementar antes de tratar este
  item como cumprido para fins de conformidade.

## Auditoria de RLS (2026-07-24)

Revisão completa de todas as 38 tabelas do schema contra `pg_tables`/policies
reais: 15 tabelas estavam sem RLS habilitado desde o design original do
schema (`audit_logs`, `product_category_history`, `product_price_history`,
`customer_identities`, `payments`, `discounts`, `coupons`, `delivery_fees`,
`menu_sessions`, `menu_events`, `cities`, `neighborhoods`,
`neighborhood_aliases`, `postal_codes`, `delivery_zones`). Isso significa que
qualquer usuário autenticado podia ler/escrever essas tabelas de **qualquer
organização** via API REST do Supabase, mesmo que a UI nunca exercesse esse
acesso — `menu_events` já era consultada de verdade pela aba Jornada, então
essa lacuna era ativa, não só teórica. Corrigido em
`supabase/migrations/0009_missing_rls_policies.sql` (e replicado em
`schema.sql`) — **precisa ser rodado manualmente no Supabase de produção**,
não é aplicado automaticamente.

## Backup

- Backup do Postgres gerenciado pelo Supabase (point-in-time recovery conforme
  plano contratado). Documentar no `DEPLOYMENT.md` qual plano garante qual
  janela de retenção.
