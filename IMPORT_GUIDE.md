# IMPORT_GUIDE.md

## Fluxo (implementado na Fase 2)

1. **Upload** do arquivo CSV/Excel na tela "Importações".
2. **Identificação de colunas**: o sistema lê o cabeçalho e tenta um
   auto-mapeamento por nome semelhante.
3. **Mapeamento manual**: usuário confirma/ajusta qual coluna do arquivo
   corresponde a qual campo interno (ex.: "Valor Total" → `gross_amount`).
4. **Pré-visualização**: primeiras N linhas mapeadas, mostrando o que vai ser
   gravado.
5. **Validação**: schema Zod específico por `import_type` valida tipo,
   obrigatoriedade e formato de cada linha; erros vão para `import_errors` sem
   travar as linhas válidas.
6. **Importação**: linhas válidas viram registros (idempotente pela mesma regra
   de dedup de `(sales_channel_id, source_external_id)`, gerando um
   `source_external_id` sintético quando o arquivo não tiver um natural).
7. **Relatório de erros**: tela lista linha, coluna e motivo da falha.
8. **Desfazer**: marca `imports.undone_at` e reverte as linhas criadas por
   aquele import (rastreadas por `import_id` no `raw_payload`).

## Modelos disponíveis (planilhas de download)

- Pedidos (genérico)
- Pedidos — Anota AI (export nativo)
- Pedidos — iFood (export nativo do Portal do Parceiro)
- Produtos/Cardápio
- Clientes
- Cancelamentos
- Relatórios financeiros

Cada modelo é um arquivo `.xlsx` gerado a partir do mesmo schema Zod usado na
validação, para garantir que "o que a planilha pede" e "o que o sistema aceita"
nunca divirjam.
