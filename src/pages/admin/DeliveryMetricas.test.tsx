import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { sb, auth } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/supabase-mock");
  return { sb: createSupabaseMock(), auth: { profile: { company_id: "c1" } as { company_id: string } | null } };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: sb }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth }));

import DeliveryMetricas from "./DeliveryMetricas";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const now = Date.now();

/** Pedido concluído dentro do período atual, com toda a linha do tempo preenchida. */
const delivered = {
  id: "o1",
  status: "entregue",
  service_mode: "delivery",
  total: 100,
  opened_at: new Date(now - HOUR).toISOString(),
  accepted_at: new Date(now - HOUR + 5 * 60_000).toISOString(),
  ready_at: new Date(now - HOUR + 20 * 60_000).toISOString(),
  dispatched_at: new Date(now - HOUR + 25 * 60_000).toISOString(),
  delivered_at: new Date(now - HOUR + 45 * 60_000).toISOString(),
  driver_id: "d1",
};

/** Pedido cancelado, também no período atual. */
const canceled = {
  ...delivered,
  id: "o2",
  status: "cancelado",
  total: 50,
  accepted_at: null,
  ready_at: null,
  dispatched_at: null,
  delivered_at: null,
  driver_id: null,
};

/** Pedido do período anterior, usado para o comparativo. */
const older = { ...delivered, id: "o3", total: 50, opened_at: new Date(now - 45 * DAY).toISOString() };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeliveryMetricas />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.profile = { company_id: "c1" };
  sb.calls.length = 0;
  sb.from.mockClear();
  sb.setTable("orders", { data: [delivered, canceled, older], error: null });
  sb.setTable("delivery_drivers", { data: [{ id: "d1", name: "João" }], error: null });
});

describe("DeliveryMetricas", () => {
  it("não renderiza nada sem empresa vinculada", () => {
    auth.profile = null;
    const { container } = renderPage();
    expect(container).toBeEmptyDOMElement();
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("busca apenas pedidos do cardápio digital da própria empresa", async () => {
    renderPage();
    await screen.findByText("Pedidos");
    const orderCalls = sb.calls.filter((c) => c.table === "orders");
    expect(orderCalls.find((c) => c.method === "eq" && c.args[0] === "company_id")?.args[1]).toBe("c1");
    expect(orderCalls.some((c) => c.method === "eq" && c.args[0] === "origin" && c.args[1] === "digital_menu")).toBe(true);
    expect(orderCalls.some((c) => c.method === "gte" && c.args[0] === "opened_at")).toBe(true);
  });

  it("resume faturamento, ticket médio e contagens do período atual", async () => {
    renderPage();
    // faturamento concluído e ticket médio do único pedido entregue
    expect(await screen.findAllByText("R$ 100,00")).toHaveLength(2);
    expect(screen.getByText("2")).toBeInTheDocument(); // pedidos do período atual
    expect(screen.getByText("1 concluídos · 1 cancelados/recusados")).toBeInTheDocument();
  });

  it("calcula o tempo médio de cada etapa", async () => {
    renderPage();
    expect(await screen.findByText("Recebido → aceito")).toBeInTheDocument();
    expect(screen.getAllByText("5 min").length).toBeGreaterThan(0); // aceite e despacho
    expect(screen.getByText("15 min")).toBeInTheDocument(); // preparo
    expect(screen.getByText("20 min")).toBeInTheDocument(); // rota
  });

  it("mostra o comparativo com o período anterior", async () => {
    renderPage();
    const deltas = await screen.findAllByText(/% vs período anterior/);
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.map((d) => d.textContent)).toContain("100.0% vs período anterior");
  });

  it("agrupa as entregas por entregador usando o nome cadastrado", async () => {
    renderPage();
    expect(await screen.findByText("João")).toBeInTheDocument();
    expect(screen.getByText("1 entrega · média de 20 min por rota")).toBeInTheDocument();
  });

  it("usa rótulo genérico quando o entregador não está mais cadastrado", async () => {
    sb.setTable("delivery_drivers", { data: [], error: null });
    renderPage();
    expect(await screen.findByText("Entregador")).toBeInTheDocument();
  });

  it("exibe estados vazios quando não há pedidos", async () => {
    sb.setTable("orders", { data: [], error: null });
    renderPage();
    expect(await screen.findByText("Sem dados no período.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma entrega atribuída no período.")).toBeInTheDocument();
    expect(screen.getByText("0 concluídos · 0 cancelados/recusados")).toBeInTheDocument();
  });

  it("refaz a consulta ao trocar o período", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Pedidos");
    const before = sb.from.mock.calls.length;

    await user.click(screen.getByRole("tab", { name: "Últimos 7 dias" }));
    await screen.findByText("Pedidos");
    expect(sb.from.mock.calls.length).toBeGreaterThan(before);
  });
});
