import { describe, it, expect, beforeEach, vi } from "vitest";

const invoke = vi.fn();
const refreshSession = vi.fn();
const signOut = vi.fn().mockResolvedValue(undefined);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: {
      refreshSession: (...a: unknown[]) => refreshSession(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
  },
}));

import {
  adminCreateUser, adminUpdateUser, adminListAllUsers,
  adminCreateGlobalUser, adminUpdateGlobalUser, adminResetPasswordGlobal,
} from "./admin-users";

beforeEach(() => {
  invoke.mockReset();
  refreshSession.mockReset();
  signOut.mockClear();
});

describe("admin-users — chamadas de API", () => {
  it("envia action e payload para a função admin-users", async () => {
    invoke.mockResolvedValue({ data: { id: "u1" }, error: null });
    await expect(adminCreateUser({ name: "A", email: "a@b.c", password: "x", role: "staff" })).resolves.toEqual({ id: "u1" });
    expect(invoke).toHaveBeenCalledWith("admin-users", {
      body: { action: "create", payload: { name: "A", email: "a@b.c", password: "x", role: "staff" } },
    });
  });

  it("mapeia cada operação para sua action", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await adminUpdateUser({ user_id: "1", name: "A", role: "admin", status: "ativo" });
    await adminListAllUsers({ search: "joao" });
    await adminCreateGlobalUser({ name: "A", email: "a@b.c", password: "x", company_id: null, role: "admin" });
    await adminUpdateGlobalUser({ user_id: "1", name: "A", company_id: "c", role: "staff", status: "inativo" });
    await adminResetPasswordGlobal("1", "nova");
    const actions = invoke.mock.calls.map((c) => (c[1] as { body: { action: string } }).body.action);
    expect(actions).toEqual(["update", "list_all", "create_global", "update_global", "reset_password_global"]);
  });

  it("propaga erro vindo no corpo da resposta", async () => {
    invoke.mockResolvedValue({ data: { error: "forbidden" }, error: null });
    await expect(adminListAllUsers()).rejects.toThrow("forbidden");
  });

  it("propaga erro genérico de transporte", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(adminListAllUsers()).rejects.toThrow("boom");
  });

  it("extrai a mensagem de erro do Response 4xx", async () => {
    const context = new Response(JSON.stringify({ error: "email já usado" }), { status: 400 });
    invoke.mockResolvedValue({ data: null, error: { message: "http", context } });
    await expect(adminCreateUser({ name: "A", email: "a@b.c", password: "x", role: "staff" }))
      .rejects.toThrow("email já usado");
  });
});

describe("admin-users — sessão expirada", () => {
  it("renova a sessão e repete a chamada uma vez", async () => {
    const context = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    invoke
      .mockResolvedValueOnce({ data: null, error: { message: "unauthorized", context } })
      .mockResolvedValueOnce({ data: { users: [] }, error: null });
    refreshSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });

    await expect(adminListAllUsers()).resolves.toEqual({ users: [] });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("desloga quando não consegue renovar a sessão", async () => {
    const context = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    invoke.mockResolvedValue({ data: null, error: { message: "unauthorized", context } });
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "no" } });

    await expect(adminListAllUsers()).rejects.toThrow(/sessão expirou/i);
    expect(signOut).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("falha definitivamente se a repetição também der erro", async () => {
    const context = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    invoke
      .mockResolvedValueOnce({ data: null, error: { message: "unauthorized", context } })
      .mockResolvedValueOnce({ data: null, error: { message: "ainda inválido" } });
    refreshSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });

    await expect(adminListAllUsers()).rejects.toThrow("ainda inválido");
  });
});
