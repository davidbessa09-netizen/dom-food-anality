# DOM Food Analytics

Sistema de BI para centralizar, organizar e analisar as vendas de sete operações
de alimentação (Gulas, Nikô Sushi Palhoça, Nikô Sushi Floripa e Kings Chicken via
Anota AI; três lojas via iFood), com dashboards de vendas, produtos, jornada do
cliente, clientes/RFM, bairros/região, cancelamentos, alertas e recomendações.

Interface em português do Brasil, fuso `America/Sao_Paulo`, responsivo.

## Documentação

- [ARCHITECTURE.md](ARCHITECTURE.md) — arquitetura, stack, adaptadores de integração
- [DATABASE.md](DATABASE.md) — modelo de dados (ver também `supabase/schema.sql`)
- [METRICS.md](METRICS.md) — dicionário de métricas (fórmula, fonte, real/calculado/estimado)
- [INTEGRATIONS.md](INTEGRATIONS.md) — status das integrações e checklist de credenciais
- [SECURITY.md](SECURITY.md) — segurança e LGPD
- [IMPORT_GUIDE.md](IMPORT_GUIDE.md) — fluxo de importação de CSV/Excel
- [DEPLOYMENT.md](DEPLOYMENT.md) — como rodar local e em produção

## Como rodar localmente

```bash
npm install
cp .env.example .env.local   # preencher com seu projeto Supabase (ver DEPLOYMENT.md)
npm run dev
```

Acesse http://localhost:3000

## Plano de fases

- **Fase 1 — Fundação** ✅ (implementada nesta entrega): projeto, banco, RLS,
  autenticação Supabase, organizações/marcas/lojas, perfis de usuário, dados de
  demonstração, layout base do dashboard.
- **Fase 2 — Pedidos e importações**: produtos, categorias, pedidos, itens,
  clientes, importação CSV/Excel, dashboard executivo com dados reais/demo.
- **Fase 3 — Integrações**: Anota AI, iFood (bloqueadas até checklist de
  credenciais em `INTEGRATIONS.md` ser respondido), sincronização, webhooks,
  logs, tratamento de erros.
- **Fase 4 — Inteligência comercial**: produtos mais/menos vendidos, RFM,
  comparação entre lojas, combos, cancelamentos, alertas.
- **Fase 5 — Jornada**: eventos, sessões, funil (real ou "parcial", nunca
  inventado), UTMs, visualizado × comprado.
- **Fase 6 — Produção**: testes, segurança, LGPD, performance, backup, deploy,
  monitoramento.

## Dados de demonstração

Toda organização de exemplo é criada com `is_demo = true` e exibe uma faixa
"DEMONSTRAÇÃO" na interface. Nunca é misturada com dados reais — ver
`supabase/seed/demo-data.sql` e a rotina de limpeza antes de ir para produção
(`DEPLOYMENT.md`).
