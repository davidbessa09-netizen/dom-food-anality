// Tipos do payload bruto do Bar Fácil (BF Play / TicketMais), conforme
// documentação oficial recebida em 2026-08-03 ("Api Bar Fácil V2 -
// Extração de dados", API-BF-NovaVersao.json). Todo campo aqui existe
// literalmente na documentação — nada foi inferido ou inventado.

export interface BarFacilAtendente {
  codAtendente: number | string;
  nome: string;
  comissao?: number;
}

export interface BarFacilProdutoRef {
  codProduto: number;
  descricao: string;
  categoria: string | null;
  listaPreco?: string;
  combo?: unknown;
  vlrCusto?: number;
  imagem?: string;
}

export interface BarFacilItemVenda {
  codItemVenda: number;
  produto: BarFacilProdutoRef;
  nmTicket?: number;
  qtdItem: number;
  vlrItem: number;
  vlrItemUnitario: number;
  vlrItemComissao?: number;
  vlrItemComissaoUnitario?: number;
  cortesia?: boolean;
}

export interface BarFacilPagamento {
  codFormaPagamento: number;
  formaPagamento: string;
  dtPagamento: string;
  vlrPagamento: string; // vem como string na API
}

/**
 * Registro de venda — POST /vendas. "Registros com valores NEGATIVOS são
 * referentes ao tipo ESTORNO" (nota literal da documentação) — não há um
 * campo de status de cancelamento separado; o sinal do valor é o único
 * indicador confirmado de estorno.
 */
export interface BarFacilVenda {
  codVenda: number; // chave única — usada como cursor (ID sequencial confirmado via PUT)
  codVendaTerminal?: number;
  codTerminal?: number;
  codEmpresa: number;
  codEvento: number;
  atendente?: BarFacilAtendente;
  dtVenda: string; // "yyyy-MM-dd HH:mm:ss"
  tipo: string; // "Venda" no exemplo — outros valores não documentados
  setor?: string | null;
  cpf?: string | null;
  chaveNfce?: string | null;
  pessoa?: unknown;
  items: BarFacilItemVenda[];
  pagamentos: BarFacilPagamento[];
}

export interface BarFacilValidacao {
  codValidacao: number;
  codEvento: number;
  codEmpresa: number;
  codTerminalVenda: number;
  codVenda: number;
  codItemVenda: number;
  nmTicket: number;
  dtValidacao: string;
  validador: { codValidador: number; codTerminal: number; descricao: string };
  produto: { codProduto: number; descricao: string; categoria: string | null; vlrCusto?: number };
  tipoValidacao: string;
  vlrProduto: number;
  atendente: BarFacilAtendente;
}

/**
 * Movimento de consumo cashless — POST /movimento-consumo. O campo `tipo`
 * não tem seus valores enumerados na documentação recebida (só um exemplo
 * com "tipo": "2") — por isso este conector NÃO classifica automaticamente
 * este evento como venda, recarga ou consumo; ver nota em connector.ts.
 */
export interface BarFacilMovimentoConsumo {
  codMovimentoConsumo: string;
  atendente: { codAtendente: string; nomeAtendente: string };
  codSessao: string;
  vlrTransacao: string;
  vlrTransacaoBonus: string;
  codTerminal: string;
  formaPagamentoTerminal: { codFormaPagamentoTerminal: string; nomeFormaPagamentoTerminal: string };
  codEvento: string;
  dtMovimento: string;
  idCartao: string;
  tipo: string; // ver BAR_FACIL_MOVIMENTO_CONSUMO_TIPO — confirmado com o Bar Fácil em 2026
  cpf?: string | null;
}

/** Valores confirmados do campo `tipo` em movimento-consumo (confirmado
 * verbalmente com o Bar Fácil — a documentação em PDF não enumera isso). */
export const BAR_FACIL_MOVIMENTO_CONSUMO_TIPO = {
  RECARGA: "1",
  CONSUMO: "2",
} as const;

/**
 * Movimento de caixa — POST /movimento-caixa. Recargas de saldo cashless
 * aparecem aqui, como um dos valores de `tipoMovimentacao` (o exemplo da
 * documentação mostra "Suprimento", que é uma operação de caixa comum,
 * não necessariamente o valor usado pra recarga — o texto exato pro valor
 * "recarga" ainda não foi confirmado, só que é ESTE endpoint).
 * NUNCA tratar nenhuma linha daqui como venda de produto.
 */
export interface BarFacilMovimentoCaixa {
  codMovimentoCaixa: string;
  data: string;
  atendente: { codAtendente: string; nomeAtendente: string };
  usuario: { codUsuario: string; nomeUsuario: string };
  codTerminal: string;
  tipoMovimentacao: string;
  formaPagamentoTerminal: { codFormaPagamentoTerminal: string; nomeFormaPagamentoTerminal: string };
  valor: string;
}

export interface BarFacilReimpressaoVenda {
  codReimpressaoVenda: string;
  dtReimpressao: string;
  codTerminal: string;
  atendente: { codAtendente: string; nomeAtendente: string };
  responsavel: { codResponsavel: string; nomeResponsavel: string };
  dtVenda: string;
  vlVenda: string;
  codEvento: number;
}

/** POST /eventos — o "estabelecimento/evento" da nossa arquitetura de
 * mapeamento (ver barfacil_establishment_links). */
export interface BarFacilEvento {
  codEvento: number;
  descricao: string;
  dtInicio: string;
  dtTermino: string;
  validarTicket: boolean;
  tag?: string;
  situacao: "Ativo" | "Finalizado" | string;
  empresa: { codEmpresa: number; razaoSocial: string; cidade?: string; uf?: string };
}

export interface BarFacilAtendenteListItem {
  id: number;
  nome: string;
}

export interface BarFacilProduto {
  id: number;
  nome: string;
  categoriaId: number | null;
  categoria: string | null;
}

export interface BarFacilSessao {
  codSessao: number;
  descricao: string;
  dtInicio: string;
  dtTermino: string;
}

export interface BarFacilTagListItem {
  id: string;
  saldoMonetarioCartao: string;
  saldoBonus: string;
  saldoAtual: string;
  data: string;
}

export interface BarFacilIngresso {
  codItemVenda: number;
  lote: string;
  produto: string;
  vlrItem: number;
  dtVenda: string;
  dtConfirmado: string;
  codTerminal: number;
  codProduto: number;
  tipo: string;
  cpf?: string | null;
  situacao: "Ativo" | "Inativo" | "Cancelado";
  qrcode: string;
}

/** Ambientes documentados. */
export const BAR_FACIL_BASE_URLS = {
  producao: "https://api.ticketmais.com.br/bf",
  homologacao: "https://deploy-api.ticketmais.com.br/bf",
} as const;

/** Nome dos endpoints do tipo "Extração de dados" — todos seguem o mesmo
 * fluxo POST (consulta) → PUT (confirma recebimento) → DELETE (reinicia
 * cursor do evento), documentado no topo do PDF. */
export const BAR_FACIL_EXTRACTION_ENDPOINTS = [
  "vendas",
  "validacoes",
  "movimento-consumo",
  "movimento-caixa",
  "reimpressao-vendas",
] as const;
export type BarFacilExtractionEndpoint = (typeof BAR_FACIL_EXTRACTION_ENDPOINTS)[number];
