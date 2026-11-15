import { describe, it, expect } from "vitest";
import {
  exactMoney,
  sumMoney,
  fiscalCsv,
  defaultFilters,
  shiftPeriod,
  CATEGORIES,
  type FiscalDocument,
} from "./domain";
const note = (total = "0.10"): FiscalDocument => ({
  id: "test",
  company_id: "company",
  direction: "saida",
  model: "NFC-e",
  series: "001",
  number: "00012",
  access_key: "0".repeat(44),
  participant_name: '=HYPERLINK("x")',
  issued_at: null,
  movement_at: null,
  posted_at: null,
  created_at: "2026-11-01T12:00:00Z",
  total,
  authorization_status: "rejeitada",
  transmission_status: "enviada",
  category: "transmitidas",
  fiscal_message: null,
  receipt_status: "nao_informado",
  financial_status: "nao_informado",
  order_id: null,
  last_checked_at: null,
});
describe("Fiscal value rules", () => {
  it("formats exact money beyond floating-point precision", () =>
    expect(exactMoney("9999999999999999.99")).toBe("R$ 9.999.999.999.999.999,99"));
  it("sums cents exactly", () => expect(sumMoney([note("0.10"), note("0.20")])).toBe("0.30"));
  it("rejects malformed financial amounts", () =>
    expect(() => sumMoney([note("NaN")])).toThrow("Valor fiscal inválido"));
  it("keeps rejected authorization distinct from sent transmission", () => {
    const csv = fiscalCsv([note()]);
    expect(csv).toContain('"Rejeitada";"Enviada"');
  });
  it("protects formulas and preserves textual leading zero identifiers", () => {
    const csv = fiscalCsv([note()]);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"\'001";"\'00012"');
    expect(csv).toContain(`"'${"0".repeat(44)}"`);
  });
  it("uses the full current month including leap years", () => {
    const filters = defaultFilters("entrada", new Date(2024, 1, 15));
    expect([filters.from, filters.to]).toEqual(["2024-02-01", "2024-02-29"]);
  });
  it("moves a period while preserving search scope", () => {
    const filters = { ...defaultFilters("saida", new Date(2026, 11, 1)), participant: "Teste" };
    expect(shiftPeriod(filters, 1)).toMatchObject({
      from: "2027-01-01",
      to: "2027-01-31",
      participant: "Teste",
      category: "transmitidas",
    });
  });
  it("keeps exclusion separate from cancellation categories", () =>
    expect(CATEGORIES.entrada.map((c) => c.value)).toEqual(["autorizadas", "excluidas"]));
});
