import { describe, it, expect } from "vitest";
import { parseDecimal, parseDecimalOr, sanitizeDecimalKeystroke, formatDecimal } from "./decimal";

describe("parseDecimal", () => {
  it("aceita vírgula e ponto como separador decimal", () => {
    expect(parseDecimal("12,50")).toBe(12.5);
    expect(parseDecimal("12.50")).toBe(12.5);
  });

  it("ignora separadores de milhar em ambos os formatos", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("1,234.56")).toBe(1234.56);
  });

  it("ignora símbolos monetários e espaços", () => {
    expect(parseDecimal(" R$ 10,00 ")).toBe(10);
    expect(parseDecimal("15 %")).toBe(15);
  });

  it("aceita números e devolve NaN para entradas inválidas", () => {
    expect(parseDecimal(3.5)).toBe(3.5);
    expect(parseDecimal("")).toBeNaN();
    expect(parseDecimal(null)).toBeNaN();
    expect(parseDecimal({})).toBeNaN();
    expect(parseDecimal("abc")).toBeNaN();
  });
});

describe("parseDecimalOr", () => {
  it("usa o fallback em entradas inválidas", () => {
    expect(parseDecimalOr("abc")).toBe(0);
    expect(parseDecimalOr("abc", 7)).toBe(7);
    expect(parseDecimalOr("2,5", 7)).toBe(2.5);
  });
});

describe("sanitizeDecimalKeystroke", () => {
  it("remove caracteres não numéricos", () => {
    expect(sanitizeDecimalKeystroke("a1b2,5c")).toBe("12,5");
  });

  it("bloqueia sinal negativo por padrão e permite quando habilitado", () => {
    expect(sanitizeDecimalKeystroke("-5")).toBe("5");
    expect(sanitizeDecimalKeystroke("-5", { allowNegative: true })).toBe("-5");
    expect(sanitizeDecimalKeystroke("5-3", { allowNegative: true })).toBe("53");
  });

  it("mantém no máximo um separador decimal", () => {
    expect(sanitizeDecimalKeystroke("1.2.3")).toBe("12,3");
  });
});

describe("formatDecimal", () => {
  it("formata em pt-BR com casas configuráveis", () => {
    expect(formatDecimal(1234.5)).toBe("1.234,50");
    expect(formatDecimal(1234.5, 0)).toBe("1.235");
  });

  it("retorna vazio para valores não finitos", () => {
    expect(formatDecimal(Number.NaN)).toBe("");
    expect(formatDecimal(Number.POSITIVE_INFINITY)).toBe("");
  });
});
