import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { fetchPublicOrder, toastError } = await vi.hoisted(async () => {
  const { vi: v } = await import("vitest");
  return { fetchPublicOrder: v.fn(), toastError: v.fn() };
});

vi.mock("@/lib/digital-menu-cart", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/digital-menu-cart")>()),
  fetchPublicOrder,
}));
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

import CardapioPedido from "./CardapioPedido";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const baseOrder = {
  id: "o1",
  order_number: 42,
  status: "em_preparo",
  service_mode: "delivery",
  customer_name: "Ana",
  customer_phone: "11999990000",
  delivery_address: { street: "Rua A", number: "10", complement: "ap 2", neighborhood: "Centro", reference: "Portão azul" },
  payment_method: "pix",
  payment_status: "pendente",
  change_for: null,
  customer_notes: "Sem cebola",
  subtotal: 30,
  delivery_fee: 5,
  total: 35,
  opened_at: minutesAgo(20),
  accepted_at: minutesAgo(15),
  ready_at: null,
  dispatched_at: null,
  delivered_at: null,
  estimated_minutes: 40,
  rejection_reason: null,
  driver_name: null,
  items: [
    { name: "Coxinha", quantity: 2, unit_price: 5, total_price: 10, notes: "bem passada", kitchen_status: "pendente" },
    { name: "Refri", quantity: 1, unit_price: 20, total_price: 20, notes: null, kitchen_status: "pendente" },
  ],
};

const payload = (over: Record<string, unknown> = {}) => ({
  found: true,
  order: baseOrder,
  company: { name: "Bar do Zé", slug: "bar", logo_url: null, primary_color: "#ff0000" },
  pix: { key: "chave-pix-123", key_type: "email", holder: "Zé" },
  ...over,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/cardapio/bar/pedido/tok"]}>
        <Routes>
          <Route path="/cardapio/:slug/pedido/:token" element={<CardapioPedido />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchPublicOrder.mockReset();
  toastError.mockReset();
  fetchPublicOrder.mockResolvedValue(payload());
});

describe("CardapioPedido", () => {
  it("consulta o pedido pelo token da URL", async () => {
    renderPage();
    expect(screen.getByText("Carregando pedido…")).toBeInTheDocument();
    await screen.findByText("Pedido #42");
    expect(fetchPublicOrder).toHaveBeenCalledWith("tok");
  });

  it("mostra o status atual e o resumo financeiro", async () => {
    renderPage();
    expect(await screen.findByText("Pedido #42")).toBeInTheDocument();
    expect(screen.getAllByText("Em preparo na cozinha").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 30,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 5,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 35,00")).toBeInTheDocument();
    expect(screen.getByText("2× Coxinha")).toBeInTheDocument();
    expect(screen.getByText("bem passada")).toBeInTheDocument();
    expect(screen.getByText("Sem cebola")).toBeInTheDocument();
  });

  it("monta a linha do tempo de entrega com etapas concluídas, atual e pendentes", async () => {
    renderPage();
    await screen.findByText("Pedido #42");
    expect(screen.getByText("Pedido recebido")).toBeInTheDocument();
    expect(screen.getByText("Aceito pelo estabelecimento")).toBeInTheDocument();
    expect(screen.getByText("Pronto para sair")).toBeInTheDocument();
    expect(screen.getByText("Saiu para entrega")).toBeInTheDocument();
    expect(screen.getByText("Em andamento…")).toBeInTheDocument();
    expect(screen.getAllByText("Pendente")).toHaveLength(2);
  });

  it("usa etapas de retirada quando o pedido não é delivery", async () => {
    fetchPublicOrder.mockResolvedValue(
      payload({ order: { ...baseOrder, service_mode: "pickup", delivery_fee: 0, delivery_address: null } }),
    );
    renderPage();
    expect(await screen.findByText("Pronto para retirada")).toBeInTheDocument();
    expect(screen.getByText("Retirado")).toBeInTheDocument();
    expect(screen.queryByText("Saiu para entrega")).not.toBeInTheDocument();
    expect(screen.queryByText("Taxa de entrega")).not.toBeInTheDocument();
  });

  it("exibe o endereço e o entregador quando informados", async () => {
    fetchPublicOrder.mockResolvedValue(payload({ order: { ...baseOrder, driver_name: "João" } }));
    renderPage();
    await screen.findByText("Pedido #42");
    expect(screen.getByText("João")).toBeInTheDocument();
    expect(screen.getByText(/Rua A, 10 — ap 2/)).toBeInTheDocument();
    expect(screen.getByText("Ref: Portão azul")).toBeInTheDocument();
  });

  it("oculta a linha do tempo e mostra o motivo quando recusado", async () => {
    fetchPublicOrder.mockResolvedValue(
      payload({ order: { ...baseOrder, status: "recusado", rejection_reason: "Fora da área de entrega" } }),
    );
    renderPage();
    expect(await screen.findByText("Motivo: Fora da área de entrega")).toBeInTheDocument();
    expect(screen.queryByText("Acompanhamento")).not.toBeInTheDocument();
    expect(screen.queryByText(/atualiza automaticamente/)).not.toBeInTheDocument();
  });

  it("mostra a página de erro quando o pedido não existe", async () => {
    fetchPublicOrder.mockResolvedValue({ found: false });
    renderPage();
    expect(await screen.findByText("Pedido não encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voltar ao cardápio/ })).toHaveAttribute("href", "/cardapio/bar");
  });

  it("mostra a página de erro quando a consulta falha", async () => {
    fetchPublicOrder.mockRejectedValue(new Error("offline"));
    renderPage();
    expect(await screen.findByText("Pedido não encontrado")).toBeInTheDocument();
  });

  it("copia a chave Pix enquanto o pagamento está pendente", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderPage();
    await screen.findByText("Pedido #42");
    expect(screen.getByText("Pagamento pendente")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(writeText).toHaveBeenCalledWith("chave-pix-123");
    expect(await screen.findByRole("button", { name: "Copiado!" })).toBeInTheDocument();
  });

  it("avisa quando a área de transferência falha", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    renderPage();
    await screen.findByText("Pedido #42");
    await user.click(screen.getByRole("button", { name: "Copiar" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Não foi possível copiar a chave Pix. Copie manualmente."),
    );
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
  });

  it("esconde o bloco Pix quando o pagamento já foi confirmado", async () => {
    fetchPublicOrder.mockResolvedValue(payload({ order: { ...baseOrder, payment_status: "pago" } }));
    renderPage();
    expect(await screen.findByText("Pagamento confirmado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar" })).not.toBeInTheDocument();
  });

  it("mostra o troco para pagamentos em dinheiro", async () => {
    fetchPublicOrder.mockResolvedValue(
      payload({ order: { ...baseOrder, payment_method: "dinheiro", change_for: 50 }, pix: null }),
    );
    renderPage();
    await screen.findByText("Pedido #42");
    expect(screen.getByText("Dinheiro")).toBeInTheDocument();
    expect(screen.getByText("R$ 50,00")).toBeInTheDocument();
  });

  it("usa o nome do estabelecimento no título da página", async () => {
    renderPage();
    await screen.findByText("Pedido #42");
    expect(document.title).toBe("Pedido · Bar do Zé");
  });
});
