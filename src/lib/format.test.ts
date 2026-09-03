import { describe, it, expect, vi, afterEach } from "vitest";
import { fmtBRL, fmtTime, fmtDateTime, minutesSince } from "./format";

const nbsp = (s: string) => s.replaceAll("\u00a0", " ");

describe("fmtBRL", () => {
  it("formata números e strings numéricas", () => {
    expect(nbsp(fmtBRL(10))).toBe("R$ 10,00");
    expect(nbsp(fmtBRL("1234.5"))).toBe("R$ 1.234,50");
  });

  it("trata null e undefined como zero", () => {
    expect(nbsp(fmtBRL(null))).toBe("R$ 0,00");
    expect(nbsp(fmtBRL(undefined))).toBe("R$ 0,00");
  });

  it("preserva sinal negativo", () => {
    expect(nbsp(fmtBRL(-5))).toBe("-R$ 5,00");
  });
});

describe("fmtTime e fmtDateTime", () => {
  const iso = "2026-03-10T15:04:00";

  it("formata hora com dois dígitos", () => {
    expect(fmtTime(iso)).toBe("15:04");
    expect(fmtTime(new Date(iso))).toBe("15:04");
  });

  it("formata data e hora curtas em pt-BR", () => {
    expect(nbsp(fmtDateTime(iso))).toBe("10/03/2026, 15:04");
  });
});

describe("minutesSince", () => {
  afterEach(() => vi.useRealTimers());

  it("conta minutos completos decorridos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    expect(minutesSince("2026-03-10T11:30:30Z")).toBe(29);
    expect(minutesSince("2026-03-10T12:00:00Z")).toBe(0);
  });

  it("retorna valor negativo para datas futuras", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    expect(minutesSince("2026-03-10T12:10:00Z")).toBe(-10);
  });
});
