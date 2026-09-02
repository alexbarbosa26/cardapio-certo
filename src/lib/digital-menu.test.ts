import { describe, it, expect } from "vitest";
import { computeOpenStatus, WEEKDAYS, type DigitalMenuHour } from "./digital-menu";

const day = (weekday: number, over: Partial<DigitalMenuHour> = {}): DigitalMenuHour => ({
  weekday,
  is_open: true,
  period1_start: "09:00:00",
  period1_end: "14:00:00",
  period2_start: null,
  period2_end: null,
  ...over,
});

/** Quarta-feira (weekday 3) local. */
const at = (hhmm: string) => new Date(`2026-01-07T${hhmm}:00`);

describe("computeOpenStatus", () => {
  it("fecha quando não há horários cadastrados", () => {
    expect(computeOpenStatus(undefined, at("10:00"))).toEqual({ open: false, next: null });
    expect(computeOpenStatus([], at("10:00"))).toEqual({ open: false, next: null });
  });

  it("abre dentro do primeiro período", () => {
    expect(computeOpenStatus([day(3)], at("10:00"))).toEqual({ open: true, next: null });
  });

  it("abre dentro do segundo período", () => {
    const hours = [day(3, { period2_start: "18:00:00", period2_end: "23:00:00" })];
    expect(computeOpenStatus(hours, at("19:30")).open).toBe(true);
  });

  it("fecha entre os períodos e anuncia a próxima abertura de hoje", () => {
    const hours = [day(3, { period2_start: "18:00:00", period2_end: "23:00:00" })];
    expect(computeOpenStatus(hours, at("16:00"))).toEqual({ open: false, next: null });
  });

  it("anuncia a abertura de hoje quando ainda não começou", () => {
    expect(computeOpenStatus([day(3)], at("07:00"))).toEqual({ open: false, next: "hoje às 09:00" });
  });

  it("anuncia amanhã quando o dia atual já encerrou", () => {
    const hours = [day(3), day(4, { period1_start: "11:00:00" })];
    expect(computeOpenStatus(hours, at("20:00"))).toEqual({ open: false, next: "amanhã às 11:00" });
  });

  it("usa o rótulo abreviado para dias mais distantes", () => {
    const hours = [day(3), day(6, { period1_start: "12:00:00" })];
    expect(computeOpenStatus(hours, at("20:00")).next).toBe("sáb às 12:00");
  });

  it("ignora dias fechados ou sem horário de início", () => {
    const hours = [day(3, { is_open: false }), day(5, { period1_start: null, period2_start: null })];
    expect(computeOpenStatus(hours, at("10:00"))).toEqual({ open: false, next: null });
  });

  it("trata período incompleto como fechado", () => {
    expect(computeOpenStatus([day(3, { period1_end: null })], at("10:00")).open).toBe(false);
  });

  it("expõe os nomes dos dias em ordem", () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS[0]).toBe("Domingo");
  });
});
