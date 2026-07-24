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
  commitadas.
- CRON de sincronização: usar Vercel Cron (ou Supabase Scheduled Functions)
  apontando para `/api/cron/sync` com o header secret configurado.
- Antes de ir para produção: rodar a rotina de limpeza de dados de demonstração
  (`DELETE /api/admin/demo-data`), nunca lançar com `is_demo=true` misturado a
  dados reais.
