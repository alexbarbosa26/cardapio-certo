import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { defaultFilters } from "@/lib/fiscal/domain";
const mocked = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/fiscal/repository", () => ({
  getFiscalDocument: mocked.get,
  getFiscalFile: vi.fn(),
  auditFiscalDistribution: vi.fn(),
}));
import { FiscalDetail } from "./FiscalDetail";
beforeEach(() =>
  mocked.get.mockResolvedValue({
    document: {
      id: "note",
      number: "00012",
      series: "001",
      model: "NFC-e",
      participant_name: "Documento sintético de teste",
      total: "0.30",
      authorization_status: "rejeitada",
      transmission_status: "enviada",
      fiscal_message: "Rejeição de teste",
      issued_at: null,
      movement_at: null,
      posted_at: null,
      created_at: "2026-11-01T12:00:00Z",
      order_id: null,
      last_checked_at: null,
    },
    snapshot: {
      participants: [
        { title: "Emitente histórico", fields: [{ label: "Nome", value: "Nome original" }] },
      ],
    },
    files: [],
    events: [],
  }),
);
it("loads the selected tenant/document and reads historical participants without a mutation", async () => {
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <FiscalDetail
          companyId="company-test"
          documentId="note"
          direction="saida"
          filters={defaultFilters("saida")}
          onClose={() => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(mocked.get).toHaveBeenCalledWith("company-test", "note"));
  await screen.findByText("R$ 0,30");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Participantes" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(await screen.findByText("Nome original")).toBeInTheDocument();
});
