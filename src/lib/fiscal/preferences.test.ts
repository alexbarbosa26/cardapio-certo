import { beforeEach, it, expect } from "vitest";
import { readFiscalFilters, saveFiscalFilters } from "./preferences";
import { defaultFilters } from "./domain";
beforeEach(() => localStorage.clear());
it("isolates filter preferences by tenant and direction", () => {
  saveFiscalFilters("a", "entrada", {
    ...defaultFilters("entrada"),
    participant: "Fornecedor teste",
  });
  expect(readFiscalFilters("a", "entrada").participant).toBe("Fornecedor teste");
  expect(readFiscalFilters("b", "entrada").participant).toBe("");
  expect(readFiscalFilters("a", "saida").participant).toBe("");
});
it("recovers malformed saved preferences", () => {
  localStorage.setItem("mesachef:fiscal:filters:a:entrada", "invalid");
  expect(readFiscalFilters("a", "entrada").category).toBe("autorizadas");
});
