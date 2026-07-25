import { describe, expect, it } from "vitest";
import { formatPaymentMethod } from "@/lib/format/payment-method";

describe("formatPaymentMethod", () => {
  it("traduz códigos conhecidos do dicionário", () => {
    expect(formatPaymentMethod("card")).toBe("Cartão (maquininha/entrega)");
    expect(formatPaymentMethod("money")).toBe("Dinheiro");
    expect(formatPaymentMethod("pix-ifood")).toBe("Pix (iFood)");
    expect(formatPaymentMethod("online-wallet-ifood")).toBe("Carteira iFood");
  });

  it("traduz o padrão ifood-online-X-payin", () => {
    expect(formatPaymentMethod("ifood-online-pix-payin")).toBe("iFood Online — Pix");
    expect(formatPaymentMethod("ifood-online-nupay-payin")).toBe("iFood Online — NuPay");
    expect(formatPaymentMethod("ifood-online-applepay-payin")).toBe("iFood Online — Apple Pay");
  });

  it("nunca mostra em branco — cai num fallback legível pra código desconhecido", () => {
    expect(formatPaymentMethod("some_unknown_code")).toBe("Some Unknown Code");
  });

  it("mostra 'Não informado' quando o valor é nulo", () => {
    expect(formatPaymentMethod(null)).toBe("Não informado");
  });
});
