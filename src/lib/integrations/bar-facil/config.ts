/**
 * Configuração não sensível de uma integração Bar Fácil — persistida em
 * `integrations.config` (jsonb). Alinhada com a documentação oficial
 * recebida em 2026-08-03 ("Api Bar Fácil V2 - Extração de dados"):
 *  - Autenticação é um único token estático no header `Authorization`
 *    (gerado na tela "Gestão de Integradores" do BF Play) — não há
 *    OAuth2/client_id/client_secret/API key documentados.
 *  - As URLs base são fixas por ambiente (não configuráveis livremente):
 *    produção https://api.ticketmais.com.br/bf, homologação/deploy
 *    https://deploy-api.ticketmais.com.br/bf (ver [[BAR_FACIL_BASE_URLS]]
 *    em ./types.ts).
 *  - Não há um único "ID de organização/evento/estabelecimento" fixo —
 *    cada loja é vinculada a um `codEvento` específico via
 *    barfacil_establishment_links (múltiplos eventos por integração).
 */
export interface BarFacilConfig {
  environment?: "homologacao" | "producao";
  timezone?: string;
  importStartDate?: string; // ISO yyyy-MM-dd — referência pra um futuro backfill manual
}

/** Único segredo confirmado pela documentação: o token de autenticação. */
export const BAR_FACIL_SECRET_KEYS = ["token"] as const;
export type BarFacilSecretKey = (typeof BAR_FACIL_SECRET_KEYS)[number];
