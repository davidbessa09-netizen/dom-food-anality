import { describe, expect, it } from "vitest";
import { buildAbcCurve, topNConcentration } from "@/lib/metrics/abc-curve";

describe("buildAbcCurve", () => {
  it("classifica A até 80%, B até 95%, C o resto, ordenado por faturamento desc", () => {
    const rows = buildAbcCurve([
      { name: "X", revenue: 4, quantity: 1 },
      { name: "A", revenue: 80, quantity: 1 },
      { name: "B", revenue: 15, quantity: 1 },
      { name: "C", revenue: 1, quantity: 1 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["A", "B", "X", "C"]);
    expect(rows[0].classification).toBe("A");
    expect(rows[0].cumulativeShare).toBeCloseTo(0.8, 5);
    expect(rows[1].classification).toBe("B");
    expect(rows[3].classification).toBe("C");
  });

  it("não divide por zero quando não há faturamento", () => {
    const rows = buildAbcCurve([{ name: "A", revenue: 0, quantity: 0 }]);
    expect(rows[0].share).toBe(0);
    expect(rows[0].cumulativeShare).toBe(0);
  });
});

describe("topNConcentration", () => {
  it("calcula a participação dos top N no faturamento total", () => {
    const rows = [
      { name: "A", revenue: 70, quantity: 1 },
      { name: "B", revenue: 20, quantity: 1 },
      { name: "C", revenue: 10, quantity: 1 },
    ];
    expect(topNConcentration(rows, 1)).toBeCloseTo(0.7, 5);
    expect(topNConcentration(rows, 2)).toBeCloseTo(0.9, 5);
  });

  it("retorna null quando não há faturamento", () => {
    expect(topNConcentration([{ name: "A", revenue: 0, quantity: 0 }], 10)).toBeNull();
  });
});
