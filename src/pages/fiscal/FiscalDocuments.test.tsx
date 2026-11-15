import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
const mocked = vi.hoisted(() => ({ list: vi.fn(), export: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ profile: { company_id: "company-test", role: "admin" } }),
}));
vi.mock("@/lib/fiscal/repository", () => ({
  listFiscalDocuments: mocked.list,
  exportFiscalDocuments: mocked.export,
}));
import FiscalDocuments from "./FiscalDocuments";
function mount() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TooltipProvider>
          <FiscalDocuments direction="saida" />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocked.list.mockResolvedValue({ documents: [], count: 0, total: "0.00" });
});
it("applies searches within the current company", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Destinatário"), { target: { value: "Teste" } });
  await waitFor(() =>
    expect(mocked.list).toHaveBeenLastCalledWith(
      "company-test",
      "saida",
      expect.objectContaining({ participant: "Teste" }),
      1,
      25,
    ),
  );
});
it("changes fiscal category without claiming authorization", async () => {
  mount();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Pendentes" }), {
    button: 0,
    ctrlKey: false,
  });
  await waitFor(() =>
    expect(mocked.list).toHaveBeenLastCalledWith(
      "company-test",
      "saida",
      expect.objectContaining({ category: "pendentes" }),
      1,
      25,
    ),
  );
});
it("exports using the query scope and separate audit-enabled flow", async () => {
  mocked.list.mockResolvedValue({ documents: [], count: 1, total: "10.00" });
  mocked.export.mockRejectedValue(new Error("Sem permissão"));
  mount();
  await waitFor(() => expect(screen.getByRole("button", { name: "Exportar" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Exportar" }));
  await waitFor(() =>
    expect(mocked.export).toHaveBeenCalledWith(
      "company-test",
      "saida",
      expect.objectContaining({ category: "transmitidas" }),
      [],
      "csv",
    ),
  );
});
