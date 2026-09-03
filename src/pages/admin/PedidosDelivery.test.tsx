import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { sb, auth, toasts, openWhatsapp } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/supabase-mock");
  const { vi: v } = await import("vitest");
  return {
    sb: createSupabaseMock(),
    auth: { profile: { company_id: "c1" } as { company_id: string } | null },
    toasts: { success: v.fn(), error: v.fn(), warning: v.fn() },
    openWhatsapp: v.fn(() => true),
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: sb }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/delivery-notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/delivery-notify")>()),
  openWhatsapp,
}));

import PedidosDelivery from "./PedidosDelivery";

const order = {
  id: "o1",
  order_number: 7,
  status: "aguardando_aceite",
  service_mode: "delivery",
  customer_name: "Ana",
  customer_phone: "11999990000",
  delivery_address: { street: "Rua A", number: "10", complement: null, neighborhood: "Centro", city: "SP", reference: null },
  payment_method: "pix",
  payment_status: "pendente",
  change_for: null,
  customer_notes: null,
  subtotal: 30,
  delivery_fee: 5,
  total: 35,
  opened_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  accepted_at: null,
  ready_at: null,
  dispatched_at: null,
  delivered_at: null,
  estimated_minutes: null,
  rejection_reason: null,
  cancellation_reason: null,
  driver_id: null,
  public_token: "tok",
};

const ready = { ...order, id: "o2", order_number: 8, status: "pronto", customer_name: "Bruno" };
const done = { ...order, id: "o3", order_number: 9, status: "entregue", customer_name: "Carla" };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PedidosDelivery />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.profile = { company_id: "c1" };
  localStorage.clear();
  sb.calls.length = 0;
  sb.from.mockClear();
  sb.rpc.mockReset();
  sb.rpc.mockResolvedValue({ data: null, error: null });
  openWhatsapp.mockClear().mockReturnValue(true);
  Object.values(toasts).forEach((t) => t.mockClear());
  sb.setTable("orders", { data: [order, ready, done], error: null });
  sb.setTable("delivery_drivers", { data: [{ id: "d1", name: "João", active: true }], error: null });
  sb.setTable("companies", { data: { digital_menu_slug: "bar" }, error: null });
  sb.setTable("order_items", {
    data: [{ id: "i1", product_name: "Coxinha", quantity: 2, unit_price: 5, total_price: 10, notes: null, kitchen_status: "pendente" }],
    error: null,
  });
});

describe("PedidosDelivery", () => {
  it("carrega somente pedidos do cardápio digital da empresa", async () => {
    renderPage();
    await screen.findByText("Ana");
    const orderCalls = sb.calls.filter((c) => c.table === "orders");
    expect(orderCalls.find((c) => c.method === "eq" && c.args[0] === "company_id")?.args[1]).toBe("c1");
    expect(orderCalls.some((c) => c.method === "eq" && c.args[0] === "origin" && c.args[1] === "digital_menu")).toBe(true);
  });

  it("mostra apenas os pedidos ativos na aba inicial", async () => {
    renderPage();
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
    expect(screen.queryByText("Carla")).not.toBeInTheDocument();
    expect(screen.getByText("1 novos")).toBeInTheDocument();
  });

  it("filtra os finalizados em sua própria aba", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ana");
    await user.click(screen.getByRole("tab", { name: "Finalizados" }));
    expect(await screen.findByText("Carla")).toBeInTheDocument();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
  });

  it("mostra estado vazio quando a aba não tem pedidos", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ana");
    await user.click(screen.getByRole("tab", { name: "Em entrega" }));
    expect(await screen.findByText("Nenhum pedido nesta categoria.")).toBeInTheDocument();
  });

  it("aceita o pedido enviando o tempo estimado", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ana");

    await user.click(screen.getByRole("button", { name: /Aceitar/ }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Pedido atualizado"));
    expect(sb.rpc).toHaveBeenCalledWith("admin_update_delivery_order_status", {
      _order_id: "o1",
      _new_status: "em_preparo",
      _reason: undefined,
      _estimated_minutes: 30,
    });
  });

  it("avisa quando o backend recusa a mudança de status", async () => {
    const user = userEvent.setup();
    sb.rpc.mockResolvedValue({ data: null, error: { message: "not_allowed" } });
    renderPage();
    await screen.findByText("Ana");

    await user.click(screen.getByRole("button", { name: /Aceitar/ }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("not_allowed"));
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("exige um motivo com ao menos 3 caracteres para recusar", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ana");

    await user.click(screen.getByRole("button", { name: /Recusar/ }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Recusar pedido" });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole("textbox"), "Item esgotado");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() =>
      expect(sb.rpc).toHaveBeenCalledWith("admin_update_delivery_order_status", {
        _order_id: "o1",
        _new_status: "recusado",
        _reason: "Item esgotado",
        _estimated_minutes: undefined,
      }),
    );
  });

  it("avança o pedido pronto para entrega", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Bruno");

    await user.click(screen.getByRole("button", { name: /Saiu p\/ entrega/ }));
    await waitFor(() =>
      expect(sb.rpc).toHaveBeenCalledWith(
        "admin_update_delivery_order_status",
        expect.objectContaining({ _order_id: "o2", _new_status: "em_entrega" }),
      ),
    );
  });

  it("notifica o cliente no WhatsApp com o link de acompanhamento", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Bruno");

    await user.click(screen.getAllByRole("button", { name: /Avisar$/ })[0]);
    expect(openWhatsapp).toHaveBeenCalledWith("11999990000", expect.stringContaining("bar"));
  });

  it("alerta quando o telefone é inválido para WhatsApp", async () => {
    const user = userEvent.setup();
    openWhatsapp.mockReturnValue(false);
    renderPage();
    await screen.findByText("Bruno");

    await user.click(screen.getAllByRole("button", { name: /Avisar$/ })[0]);
    expect(toasts.warning).toHaveBeenCalledWith("Telefone do cliente inválido para WhatsApp.");
  });

  it("guarda as preferências de som e aviso automático", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ana");

    await user.click(screen.getByRole("button", { name: /Som ligado/ }));
    expect(localStorage.getItem("mc:delivery:sound")).toBe("0");

    await user.click(screen.getByRole("button", { name: /Avisar no WhatsApp: off/ }));
    expect(localStorage.getItem("mc:delivery:autowa")).toBe("1");
  });

  it("abre os detalhes com itens, endereço e totais", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ana");

    await user.click(screen.getAllByRole("button", { name: "Detalhes" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Pedido #7");
    expect(within(dialog).getByText("2× Coxinha")).toBeInTheDocument();
    expect(within(dialog).getByText("Rua A, 10")).toBeInTheDocument();
    expect(within(dialog).getByText("R$ 35,00")).toBeInTheDocument();
  });

  it("oferece a seleção de entregador em pedidos de entrega", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Bruno");

    await user.click(screen.getAllByRole("button", { name: "Detalhes" })[1]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Entregador")).toBeInTheDocument();
    expect(within(dialog).getByText("Sem entregador")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Cadastre entregadores/)).not.toBeInTheDocument();
  });

  it("orienta o cadastro quando não há entregadores ativos", async () => {
    const user = userEvent.setup();
    sb.setTable("delivery_drivers", { data: [], error: null });
    renderPage();
    await screen.findByText("Bruno");

    await user.click(screen.getAllByRole("button", { name: "Detalhes" })[1]);
    expect(await screen.findByText(/Cadastre entregadores/)).toBeInTheDocument();
  });

  it("não busca nada sem empresa vinculada", async () => {
    auth.profile = null;
    renderPage();
    await screen.findByText("Pedidos Delivery");
    expect(sb.from).not.toHaveBeenCalled();
  });
});
