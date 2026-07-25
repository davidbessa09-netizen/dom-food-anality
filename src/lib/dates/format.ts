// Formatação de data/hora pra exibição — SEMPRE fixa timeZone: APP_TIMEZONE.
// Sem isso, `new Date(iso).toLocaleString("pt-BR")` usa o fuso do runtime:
// em desenvolvimento local (máquina já configurada no fuso do Brasil) parece
// certo, mas em produção (Vercel/serverless) o runtime roda em UTC por
// padrão — todo horário aparecia 3h adiantado. Use estas funções em vez de
// chamar toLocaleString/toLocaleDateString diretamente em qualquer tela.

import { APP_TIMEZONE } from "./period";

export function formatDateTimeBR(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: APP_TIMEZONE, ...opts });
}

export function formatDateBR(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: APP_TIMEZONE, ...opts });
}

/** Rótulo "dd/MM" a partir de uma string "yyyy-MM-dd" já resolvida no fuso
 * certo (ex.: salesByDay) — manipula a string direto em vez de reconstruir
 * um Date, porque `new Date("yyyy-MM-ddT00:00:00")` sem offset é
 * interpretado no fuso do RUNTIME: em produção (UTC) isso rebaixaria a data
 * pro dia anterior ao aplicar timeZone: America/Sao_Paulo por cima. */
export function formatDayLabel(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

/** "yyyy-MM-dd" → "dd/MM/yyyy", mesma lógica sem Date/timezone — usado pra
 * exibir datas soltas vindas de parâmetro de URL (ex.: seletor de período
 * personalizado). */
export function formatDateInputBR(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}
