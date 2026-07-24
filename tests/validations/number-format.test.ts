import { describe, expect, it } from "vitest";
import { parseFlexibleNumber } from "@/lib/validations/number-format";

describe("parseFlexibleNumber", () => {
  it("interpreta formato brasileiro simples (vírgula decimal)", () => {
    expect(parseFlexibleNumber("89,90")).toBe(89.9);
  });

  it("interpreta formato internacional simples (ponto decimal)", () => {
    expect(parseFlexibleNumber("89.90")).toBe(89.9);
  });

  it("interpreta formato brasileiro com milhar (1.234,56)", () => {
    expect(parseFlexibleNumber("1.234,56")).toBe(1234.56);
  });

  it("interpreta formato internacional com milhar (1,234.56)", () => {
    expect(parseFlexibleNumber("1,234.56")).toBe(1234.56);
  });

  it("interpreta inteiro sem separador", () => {
    expect(parseFlexibleNumber("450")).toBe(450);
  });

  it("retorna undefined para string vazia", () => {
    expect(parseFlexibleNumber("")).toBeUndefined();
  });

  it("ignora símbolo de moeda e espaços", () => {
    expect(parseFlexibleNumber("R$ 89,90")).toBe(89.9);
  });
});
