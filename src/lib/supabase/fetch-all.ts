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
 * páginas.
 *
 * Performance: a 1ª página é buscada sozinha (a maioria das queries cabe
 * nela → 1 request só). Se ela vier cheia, as páginas seguintes são
 * buscadas em PARALELO, em lotes de `PARALLEL_PAGES`, cada uma num clone
 * do builder (o builder do postgrest-js guarda a URL num objeto mutável,
 * então disparar `.range()` concorrente no MESMO builder faria todas as
 * páginas pedirem o mesmo offset).
 */
const PAGE_SIZE = 1000;
const PARALLEL_PAGES = 4;

type PageResult<Row> = { data: Row[] | null; error: PostgrestError | null };

interface PaginatableQuery<Row> extends PromiseLike<PageResult<Row>> {
  order(column: string, options?: { ascending?: boolean }): unknown;
  range(from: number, to: number): PromiseLike<PageResult<Row>>;
}

/** Clona um PostgrestBuilder real (URL própria). Retorna null se não for clonável (ex.: fakes de teste). */
function cloneBuilder<Row>(query: PaginatableQuery<Row>): PaginatableQuery<Row> | null {
  const q = query as unknown as { url?: unknown; retryEnabled?: boolean; constructor: new (b: unknown) => unknown };
  if (!(q.url instanceof URL)) return null;
  return new q.constructor({
    ...q,
    url: new URL(q.url.toString()),
    retry: q.retryEnabled,
  }) as PaginatableQuery<Row>;
}

export async function fetchAll<Row>(
  query: PaginatableQuery<Row>,
  { max = Infinity, orderById = true }: { max?: number; orderById?: boolean } = {}
): Promise<{ data: Row[]; error: PostgrestError | null }> {
  if (orderById) query.order("id", { ascending: true });

  const fetchPage = (from: number, parallel: boolean) => {
    const to = Math.min(from + PAGE_SIZE, max) - 1;
    const target = (parallel ? cloneBuilder(query) : null) ?? query;
    return Promise.resolve(target.range(from, to)).then((res) => ({ res, expected: to - from + 1 }));
  };

  const rows: Row[] = [];
  const canParallel = cloneBuilder(query) !== null;

  // 1ª página sozinha.
  const first = await fetchPage(0, false);
  if (first.res.error) return { data: rows, error: first.res.error };
  rows.push(...(first.res.data ?? []));
  if ((first.res.data ?? []).length < first.expected) return { data: rows, error: null };

  let from = PAGE_SIZE;
  while (from < max) {
    const batchSize = canParallel ? PARALLEL_PAGES : 1;
    const starts: number[] = [];
    for (let i = 0; i < batchSize && from < max; i++, from += PAGE_SIZE) starts.push(from);

    const pages = await Promise.all(starts.map((s) => fetchPage(s, canParallel)));
    for (const { res, expected } of pages) {
      if (res.error) return { data: rows, error: res.error };
      const page = res.data ?? [];
      rows.push(...page);
      if (page.length < expected) return { data: rows, error: null };
    }
  }
  return { data: rows, error: null };
}
