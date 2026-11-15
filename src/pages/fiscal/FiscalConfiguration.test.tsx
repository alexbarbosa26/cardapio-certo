import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mock = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), companyId: "company-test" }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ profile: { company_id: mock.companyId, role: "admin" } }),
}));
vi.mock("@/lib/fiscal/certificates", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadFiscalConfiguration: mock.load,
  saveFiscalConfiguration: mock.save,
}));
import FiscalConfiguration from "./FiscalConfiguration";
function mount() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <FiscalConfiguration />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.companyId = "company-test";
  mock.load.mockResolvedValue({
    preferences: { environment: "test", expiry_warning_days: 30 },
    certificates: [],
  });
  mock.save.mockResolvedValue(undefined);
});
it("saves environment preferences without activating certificate operations", async () => {
  mount();
  await screen.findByLabelText("Ambiente");
  fireEvent.change(screen.getByLabelText("Alertar antes do vencimento (dias)"), {
    target: { value: "45" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar preferências" }));
  await waitFor(() =>
    expect(mock.save).toHaveBeenCalledWith("company-test", {
      environment: "test",
      expiry_warning_days: 45,
    }),
  );
});
it("explains the provider requirement without accepting private files", async () => {
  const { container } = render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <FiscalConfiguration />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: "Cadastrar certificado" });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar certificado" }));
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "Upload e validação de certificado dependem do serviço fiscal escolhido",
  );
  expect(container.querySelector("input[type=file]")).toBeNull();
});
it("discards pending edits when the active company changes", async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = () => (
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <FiscalConfiguration />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const { rerender } = render(view());
  await screen.findByLabelText("Ambiente");
  fireEvent.change(screen.getByLabelText("Alertar antes do vencimento (dias)"), {
    target: { value: "45" },
  });
  mock.companyId = "other-company";
  mock.load.mockResolvedValue({
    preferences: { environment: "production", expiry_warning_days: 60 },
    certificates: [],
  });
  rerender(view());
  await waitFor(() =>
    expect(screen.getByLabelText("Alertar antes do vencimento (dias)")).toHaveValue(60),
  );
  expect(screen.getByRole("button", { name: "Salvar preferências" })).toBeDisabled();
  expect(mock.save).not.toHaveBeenCalled();
});
