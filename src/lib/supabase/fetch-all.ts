import type { PostgrestError } from "@supabase/supabase-js";

/**
 * O PostgREST do Supabase devolve no máximo `max_rows` linhas por request
 * (padrão 1000, configurado em Settings → API). Qualquer `select` sem
 * paginação — inclusive com `.limit(20000)` — é cortado silenciosamente
 * nesse teto, o que fazia as métricas agregadas no servidor (faturamento,
 * pedidos, gráficos) enxergarem só os 1000 primeiros pedidos do período.
 *
 * `fetchAll` reexecuta a mesma query em páginas de `PAGE_SIZE` via
 * `.range()` até esgotar o resultado (ou atingir `max`), sempre com
 * desempate estável por `id` pra nenhuma linha duplicar/pular entre
 * páginas. O builder do postgrest-js é reexecutável (cada `await` faz um
 * fetch novo com a URL atual) e `.range()` sobrescreve offset/limit.
 */
const PAGE_SIZE = 1000;

interface PaginatableQuery<Row> extends PromiseLike<{ data: Row[] | null; error: PostgrestError | null }> {
  order(column: string, options?: { ascending?: boolean }): unknown;
  range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>;
}

export async function fetchAll<Row>(
  query: PaginatableQuery<Row>,
  { max = Infinity, orderById = true }: { max?: number; orderById?: boolean } = {}
): Promise<{ data: Row[]; error: PostgrestError | null }> {
  if (orderById) query.order("id", { ascending: true });

  const rows: Row[] = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, max) - 1;
    const { data, error } = await query.range(from, to);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}
