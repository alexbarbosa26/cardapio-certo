import { beforeEach, describe, it, expect, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";
import { defaultFilters } from "./domain";
const mock = vi.hoisted(() => ({
  client: null as unknown as ReturnType<typeof createSupabaseMock>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: (_, key) => mock.client[key as keyof typeof mock.client] }),
}));
import {
  listFiscalDocuments,
  getFiscalDocument,
  exportFiscalDocuments,
  getFiscalFile,
} from "./repository";
beforeEach(() => {
  mock.client = createSupabaseMock();
});
describe("Fiscal consultation boundary", () => {
  it("rejects missing tenant without a request", async () => {
    await expect(
      listFiscalDocuments("", "entrada", defaultFilters("entrada"), 1, 25),
    ).rejects.toThrow("Empresa");
    expect(mock.client.rpc).not.toHaveBeenCalled();
  });
  it("rejects inverted periods", async () => {
    await expect(
      listFiscalDocuments(
        "a",
        "entrada",
        { ...defaultFilters("entrada"), from: "2026-12-01", to: "2026-11-01" },
        1,
        25,
      ),
    ).rejects.toThrow("data inicial");
  });
  it("passes tenant and combined filters to the server", async () => {
    mock.client.rpc.mockResolvedValue({
      data: { documents: [], count: 0, total: "0.00" },
      error: null,
    });
    const filters = {
      ...defaultFilters("saida"),
      series: "001",
      number: "0002",
      status: "rejeitada",
      model: "NFC-e",
    };
    await listFiscalDocuments("a", "saida", filters, 2, 10);
    expect(mock.client.rpc).toHaveBeenCalledWith(
      "list_fiscal_documents",
      expect.objectContaining({
        _company_id: "a",
        _filters: filters,
        _page: 2,
        _size: 10,
        _export: false,
      }),
    );
  });
  it("propagates server authorization denial", async () => {
    mock.client.rpc.mockResolvedValue({
      data: null,
      error: { message: "Acesso fiscal não permitido" },
    });
    await expect(listFiscalDocuments("a", "saida", defaultFilters("saida"), 1, 25)).rejects.toThrow(
      "não permitido",
    );
  });
  it("scopes document detail, files and events to the same tenant without writes", async () => {
    mock.client.rpc.mockResolvedValue({
      data: { id: "note", company_id: "a", total: "12.30", snapshot: {} },
      error: null,
    });
    await getFiscalDocument("a", "note");
    expect(mock.client.rpc).toHaveBeenCalledWith("get_fiscal_document", {
      _company_id: "a",
      _document_id: "note",
    });
    for (const table of ["fiscal_document_files", "fiscal_document_events"])
      expect(mock.client.calls).toContainEqual({ table, method: "eq", args: ["company_id", "a"] });
    expect(mock.client.calls.some((c) => ["insert", "update", "delete"].includes(c.method))).toBe(
      false,
    );
  });
  it("does not query attachments when a document is inaccessible", async () => {
    mock.client.rpc.mockResolvedValue({ data: null, error: null });
    await expect(getFiscalDocument("a", "foreign")).rejects.toThrow("não encontrado");
    expect(mock.client.from).not.toHaveBeenCalled();
  });
  it("exports all pages using the same filters then audits", async () => {
    mock.client.rpc
      .mockResolvedValueOnce({
        data: { documents: [{ id: "one" }], count: 2, total: "3.00" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { documents: [{ id: "two" }], count: 2, total: "3.00" },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const filters = defaultFilters("entrada");
    expect(await exportFiscalDocuments("a", "entrada", filters, [], "csv")).toHaveLength(2);
    expect(mock.client.rpc.mock.calls.slice(0, 2).map((c) => c[1]._filters)).toEqual([
      filters,
      filters,
    ]);
    expect(mock.client.rpc.mock.calls[2][0]).toBe("audit_fiscal_distribution");
  });
  it("rejects a selection that no longer belongs to the result", async () => {
    mock.client.rpc.mockResolvedValueOnce({
      data: { documents: [], count: 0, total: "0" },
      error: null,
    });
    await expect(
      exportFiscalDocuments("a", "entrada", defaultFilters("entrada"), ["foreign"], "csv"),
    ).rejects.toThrow("seleção mudou");
    expect(mock.client.rpc).toHaveBeenCalledTimes(1);
  });
  it("fails export when audit permission is denied", async () => {
    mock.client.rpc
      .mockResolvedValueOnce({ data: { documents: [], count: 0, total: "0" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Sem permissão" } });
    await expect(
      exportFiscalDocuments("a", "entrada", defaultFilters("entrada"), [], "csv"),
    ).rejects.toThrow("Sem permissão");
  });
  it("scopes file lookup by tenant and document before signing", async () => {
    mock.client.setTable("fiscal_document_files", { data: null, error: null });
    await expect(getFiscalFile("a", "note", "file")).rejects.toThrow("Arquivo não encontrado");
    expect(mock.client.calls).toContainEqual({
      table: "fiscal_document_files",
      method: "eq",
      args: ["document_id", "note"],
    });
  });
});
