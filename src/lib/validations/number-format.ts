/**
 * Converte um número vindo de planilha (CSV/Excel) para `number`, aceitando
 * tanto o formato brasileiro (1.234,56) quanto o internacional (1,234.56 ou
 * 1234.56), sem assumir um formato fixo — assumir errado multiplicaria ou
 * dividiria o valor por 100 silenciosamente, o que violaria a regra de nunca
 * inventar/distorcer dados financeiros.
 *
 * Regra: se houver vírgula E ponto, o separador que aparece por último é o
 * decimal (o outro é agrupador de milhar). Se houver só um dos dois, ele é
 * tratado como separador decimal.
 */
export function parseFlexibleNumber(raw: string): number | undefined {
  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  if (cleaned === "") return undefined;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma > -1) {
    normalized = cleaned.replace(",", ".");
  } else {
    normalized = cleaned;
  }

  const n = Number(normalized);
  return Number.isNaN(n) ? undefined : n;
}
