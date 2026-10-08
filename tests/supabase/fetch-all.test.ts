import { describe, expect, it } from "vitest";
import { fetchAll } from "@/lib/supabase/fetch-all";

function fakeQuery(total: number, serverMaxRows = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  let ordered = false;
  const q = {
    order() { ordered = true; return q; },
    range(from: number, to: number) {
      calls.push([from, to]);
      const end = Math.min(to + 1, from + serverMaxRows);
      return Promise.resolve({ data: rows.slice(from, end), error: null });
    },
    then: undefined as never,
  };
  return { q, calls, isOrdered: () => ordered };
}

describe("fetchAll", () => {
  it("passa do teto de 1000 linhas do PostgREST", async () => {
    const { q, calls, isOrdered } = fakeQuery(2027);
    const { data } = await fetchAll(q as never);
    expect(data).toHaveLength(2027);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(isOrdered()).toBe(true);
  });

  it("respeita max", async () => {
    const { q } = fakeQuery(9000);
    const { data } = await fetchAll(q as never, { max: 5000 });
    expect(data).toHaveLength(5000);
  });

  it("para quando a página vem incompleta", async () => {
    const { q, calls } = fakeQuery(1000);
    const { data } = await fetchAll(q as never);
    expect(data).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });
});
