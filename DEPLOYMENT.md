# DEPLOYMENT.md

## Ambiente local

```bash
npm install
cp .env.example .env.local   # preencher com as credenciais do seu projeto Supabase
npm run dev
```

Acesse http://localhost:3000

## Banco (Supabase)

1. Criar projeto em supabase.com.
2. Rodar `supabase/schema.sql` no SQL Editor (ou via CLI `supabase db push`).
3. Criar o primeiro usuário admin em Authentication → Users, depois inserir a
   linha correspondente em `user_organizations` com `role = 'admin_geral'`.
4. Copiar Project URL e anon key para `.env.local`.

## Produção

- Recomendado Vercel para o Next.js (integra nativamente com App Router e Route
  Handlers) + Supabase para banco/auth.
- Variáveis de ambiente de produção configuradas no painel da Vercel — nunca
  commitadas. Ver lista completa abaixo.
- CRON de sincronização: **não usar o cron nativo da Vercel no plano Hobby**
  (limitado a 1x/dia) — usar o workflow `.github/workflows/sync-cron.yml`
  (GitHub Actions, gratuito, roda a cada ~10min, chama `/api/cron/sync` do
  site publicado). Requer os secrets `SYNC_APP_URL` e `CRON_SECRET`
  configurados no repositório GitHub (Settings → Secrets and variables →
  Actions) — o valor de `CRON_SECRET` deve ser IDÊNTICO ao configurado na
  Vercel. A Tarefa Agendada do Windows local deixa de ser necessária depois
  do deploy (mantê-la ativa causaria sincronização duplicada — desativar
  com `Unregister-ScheduledTask -TaskName "DOM Food Analytics - Sync Anota AI"`).
- Antes de ir para produção: confirmar que nenhuma organização real está com
  `is_demo=true` (`select * from organizations where is_demo = true` —
  deve retornar vazio, ou só organizações que são de fato demonstração).

### Checklist de variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Onde pegar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → API Keys → Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → API Keys → Secret keys |
| `CRON_SECRET` | Gerado localmente (mesmo valor usado no secret do GitHub Actions) |
| `CREDENTIALS_ENCRYPTION_KEY` | Gerado localmente — trocar invalida os tokens de integração já salvos, exige recadastro |

### Passo a passo

1. `git push` o repositório local para um repositório remoto no GitHub.
2. Na Vercel: "Add New Project" → importar o repositório do GitHub.
3. Preencher as variáveis de ambiente acima (ambiente "Production").
4. Deploy.
5. No GitHub, configurar os secrets `SYNC_APP_URL` (URL do deploy, ex.:
   `https://seu-projeto.vercel.app`) e `CRON_SECRET` (mesmo valor da Vercel).
6. Rodar o workflow manualmente uma vez (aba Actions → "Sincronização
   automática (Anota AI)" → "Run workflow") pra confirmar que funciona antes
   de esperar o agendamento automático.
7. Desativar a Tarefa Agendada do Windows local (ver acima).
