// Tradução de códigos técnicos de pagamento (como vêm das plataformas de
// origem) para rótulos que fazem sentido pra quem opera a loja. Nunca
// esconde um código desconhecido — cai num fallback que só formata o texto
// cru (capitaliza, troca separador por espaço), nunca mostra em branco.

const DICTIONARY: Record<string, string> = {
  card: "Cartão (maquininha/entrega)",
  money: "Dinheiro",
  "pix-ifood": "Pix (iFood)",
  "online-wallet-ifood": "Carteira iFood",
};

const IFOOD_ONLINE_PATTERN = /^ifood-online-([a-z]+)-payin$/;

const METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  nupay: "NuPay",
  applepay: "Apple Pay",
  googlepay: "Google Pay",
  credit: "Crédito",
  debit: "Débito",
  wallet: "Carteira",
};

function humanize(raw: string): string {
  return raw
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatPaymentMethod(raw: string | null): string {
  if (!raw) return "Não informado";
  if (DICTIONARY[raw]) return DICTIONARY[raw];
  const match = raw.match(IFOOD_ONLINE_PATTERN);
  if (match) {
    const label = METHOD_LABEL[match[1]] ?? humanize(match[1]);
    return `iFood Online — ${label}`;
  }
  return humanize(raw);
}
