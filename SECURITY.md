# SECURITY.md

## Princípios

- Nenhum token, API key ou service role key vive no bundle do frontend.
  Toda chamada que exige credencial elevada roda em Route Handlers/Server
  Actions no Next.js (execução em servidor).
- Variáveis públicas usam o prefixo `NEXT_PUBLIC_` (apenas URL do Supabase e
  chave anônima, que já é segura para exposição por design do Supabase, pois
  RLS controla o acesso real). Toda outra credencial fica sem esse prefixo.
- Credenciais de integração (Anota AI, iFood) nunca são gravadas em texto
  plano: `integration_credentials.secret_ref` guarda apenas uma referência a um
  cofre de segredos (variável de ambiente por integração, ou Supabase Vault
  quando disponível no plano). O valor real do token nunca entra em uma coluna
  de tabela comum nem aparece em log.
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
- Direito à exclusão/anonimização: rotina administrativa que substitui
  `full_name`, `phone_masked`, `email_masked` por `null`/hash irreversível,
  mantendo o histórico agregado de pedidos (necessário para métricas) sem
  identificação pessoal.
- Retenção: política default sugerida de 24 meses para dados pessoais de
  cliente identificável, configurável por organização — a decidir com o
  responsável pelo tratamento de dados da empresa.
- Auditoria: qualquer acesso/exportação de dados de cliente identificável fica
  registrado em `audit_logs`.

## Backup

- Backup do Postgres gerenciado pelo Supabase (point-in-time recovery conforme
  plano contratado). Documentar no `DEPLOYMENT.md` qual plano garante qual
  janela de retenção.
