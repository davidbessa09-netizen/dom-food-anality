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

describe("fetchAll com builder real do postgrest-js", () => {
  it("busca páginas em paralelo, cada uma com seu próprio offset", async () => {
    const { PostgrestClient } = await import("@supabase/postgrest-js");
    const total = 4321;
    const seen: { offset: number; limit: number }[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const fakeFetch = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 1000);
      seen.push({ offset, limit });
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({ id: offset + i }));
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = new PostgrestClient("http://x.test/rest/v1", { fetch: fakeFetch as typeof fetch });
    const { data, error } = await fetchAll<{ id: number }>(client.from("orders").select("id") as never);
    expect(error).toBeNull();
    expect(data.map((r) => r.id)).toEqual(Array.from({ length: total }, (_, i) => i));
    expect(new Set(seen.map((s) => s.offset)).size).toBe(seen.length);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
