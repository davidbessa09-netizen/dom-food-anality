import packageJson from "../../package.json";

// Identidade central da marca — nome, descrição, crédito e caminhos de
// logomarca. Toda a interface deve consumir estas constantes em vez de
// repetir os textos manualmente (evita nomes divergentes entre páginas).
export const BRAND = {
  name: "DOM Food Analytics",
  shortName: "DOM Food",
  description: "Inteligência e análise de vendas para operações de food service.",
  developer: "David M. Bessa",
  logoFullPath: "/dom-logo-full.png",
  logoSymbolPath: "/dom-logo-symbol.png",
  logoAlt: "DOM Food Analytics",
  version: packageJson.version,
} as const;

export function copyrightLine(year: number = new Date().getFullYear()): string {
  return `© ${year} ${BRAND.name}`;
}
