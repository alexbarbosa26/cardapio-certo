import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { sb, toastError, toastSuccess } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/test/supabase-mock");
  const { vi: v } = await import("vitest");
  return { sb: createSupabaseMock(), toastError: v.fn(), toastSuccess: v.fn() };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: sb }));
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }));

import DriversTab, { fetchDrivers } from "./DriversTab";

const driver = {
  id: "d1",
  name: "João",
  phone: "11999990000",
  vehicle: "Moto",
  plate: "ABC1D23",
  notes: null,
  active: true,
};

/** Os campos do dialog usam Label sem htmlFor; localizamos pela ordem estável. */
function fieldsOf(dialog: HTMLElement) {
  const boxes = within(dialog).getAllByRole("textbox");
  return { nome: boxes[0], telefone: boxes[1], veiculo: boxes[2], placa: boxes[3], observacoes: boxes[4] };
}

beforeEach(() => {
  sb.from.mockClear();
  sb.calls.length = 0;
  toastError.mockClear();
  toastSuccess.mockClear();
  sb.setTable("delivery_drivers", { data: [driver], error: null });
});

describe("fetchDrivers", () => {
  it("filtra pela empresa e ordena ativos primeiro", async () => {
    await expect(fetchDrivers("c1")).resolves.toEqual([driver]);
    const eq = sb.calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["company_id", "c1"]);
    expect(sb.calls.filter((c) => c.method === "order")[0].args).toEqual(["active", { ascending: false }]);
  });

  it("devolve lista vazia quando não há dados", async () => {
    sb.setTable("delivery_drivers", { data: null, error: null });
    await expect(fetchDrivers("c1")).resolves.toEqual([]);
  });

  it("propaga erro do backend", async () => {
    sb.setTable("delivery_drivers", { data: null, error: new Error("rls") });
    await expect(fetchDrivers("c1")).rejects.toThrow("rls");
  });
});

describe("DriversTab", () => {
  it("lista os entregadores da empresa com seus dados", async () => {
    render(<DriversTab companyId="c1" />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    expect(await screen.findByText("João")).toBeInTheDocument();
    expect(screen.getByText("11999990000 · Moto · ABC1D23")).toBeInTheDocument();
  });

  it("mostra estado vazio quando não há entregadores", async () => {
    sb.setTable("delivery_drivers", { data: [], error: null });
    render(<DriversTab companyId="c1" />);
    expect(await screen.findByText("Nenhum entregador cadastrado.")).toBeInTheDocument();
  });

  it("avisa quando a carga falha", async () => {
    sb.setTable("delivery_drivers", { data: null, error: new Error("boom") });
    render(<DriversTab companyId="c1" />);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Não foi possível carregar os entregadores."));
  });

  it("exibe rótulo padrão quando não há dados adicionais", async () => {
    sb.setTable("delivery_drivers", { data: [{ ...driver, phone: null, vehicle: null, plate: null }], error: null });
    render(<DriversTab companyId="c1" />);
    expect(await screen.findByText("Sem dados adicionais")).toBeInTheDocument();
  });

  it("valida o nome antes de salvar um novo entregador", async () => {
    const user = userEvent.setup();
    render(<DriversTab companyId="c1" />);
    await screen.findByText("João");

    await user.click(screen.getByRole("button", { name: /novo entregador/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Novo entregador");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(toastError).toHaveBeenCalledWith("Informe o nome do entregador.");
    expect(sb.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("cadastra um entregador vinculado à empresa", async () => {
    const user = userEvent.setup();
    render(<DriversTab companyId="c1" />);
    await screen.findByText("João");

    await user.click(screen.getByRole("button", { name: /novo entregador/i }));
    const fields = fieldsOf(await screen.findByRole("dialog"));
    await user.type(fields.nome, "Maria");
    await user.type(fields.telefone, " 11 98888-0000 ");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Entregador cadastrado."));
    const insert = sb.calls.find((c) => c.method === "insert");
    expect(insert?.args[0]).toMatchObject({
      company_id: "c1",
      name: "Maria",
      phone: "11 98888-0000",
      vehicle: null,
      active: true,
    });
  });

  it("edita o entregador existente pelo id", async () => {
    const user = userEvent.setup();
    render(<DriversTab companyId="c1" />);
    await screen.findByText("João");

    const rowButtons = within(screen.getByRole("listitem")).getAllByRole("button");
    await user.click(rowButtons.at(-2)!);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Editar entregador");

    const nome = fieldsOf(dialog).nome;
    await user.clear(nome);
    await user.type(nome, "João Silva");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Entregador atualizado."));
    expect(sb.calls.find((c) => c.method === "update")?.args[0]).toMatchObject({ name: "João Silva" });
    expect(sb.calls.find((c) => c.method === "eq" && c.args[0] === "id")?.args[1]).toBe("d1");
  });

  it("avisa quando salvar falha", async () => {
    const user = userEvent.setup();
    render(<DriversTab companyId="c1" />);
    await screen.findByText("João");
    sb.setTable("delivery_drivers", { data: null, error: new Error("denied") });

    await user.click(screen.getByRole("button", { name: /novo entregador/i }));
    await user.type(fieldsOf(await screen.findByRole("dialog")).nome, "Maria");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Não foi possível salvar o entregador."));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("alterna a disponibilidade do entregador", async () => {
    const user = userEvent.setup();
    render(<DriversTab companyId="c1" />);
    await screen.findByText("João");

    await user.click(screen.getAllByRole("switch")[0]);
    await waitFor(() => expect(sb.calls.find((c) => c.method === "update")?.args[0]).toEqual({ active: false }));
  });

  it("exclui somente após confirmação", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    render(<DriversTab companyId="c1" />);
    await screen.findByText("João");

    const removeBtn = within(screen.getByRole("listitem")).getAllByRole("button").at(-1)!;
    await user.click(removeBtn);
    expect(sb.calls.some((c) => c.method === "delete")).toBe(false);

    confirmSpy.mockReturnValue(true);
    await user.click(removeBtn);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Entregador excluído."));
    confirmSpy.mockRestore();
  });
});
