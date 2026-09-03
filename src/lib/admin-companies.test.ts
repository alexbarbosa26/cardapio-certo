import { describe, it, expect, beforeEach, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import {
  adminCreateCompany,
  adminUpdateCompany,
  adminSetSubscription,
  adminSuspendCompany,
  adminReactivateCompany,
  adminPromoteSuperAdmin,
} from "./admin-companies";

const input = {
  name: "Bar do Zé",
  admin_name: "Zé",
  admin_email: "ze@example.com",
  admin_password: "Sup3rS3nh4!",
};

describe("cliente admin-companies", () => {
  beforeEach(() => invoke.mockReset());

  it("envia ação e payload para a função de borda", async () => {
    invoke.mockResolvedValue({ data: { company_id: "c1", admin_user_id: "u1" }, error: null });
    await expect(adminCreateCompany(input)).resolves.toEqual({ company_id: "c1", admin_user_id: "u1" });
    expect(invoke).toHaveBeenCalledWith("admin-companies", {
      body: { action: "create_company", payload: input },
    });
  });

  it("prioriza a mensagem de erro devolvida no corpo", async () => {
    invoke.mockResolvedValue({ data: { error: "forbidden" }, error: { message: "500" } });
    await expect(adminCreateCompany(input)).rejects.toThrow("forbidden");
  });

  it("usa a mensagem do transporte quando o corpo não traz erro", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(adminCreateCompany(input)).rejects.toThrow("network down");
  });

  it("usa mensagem padrão quando não há detalhe algum", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "" } });
    await expect(adminCreateCompany(input)).rejects.toThrow("Erro ao chamar admin-companies.");
  });

  it("rejeita quando a resposta de sucesso contém erro de negócio", async () => {
    invoke.mockResolvedValue({ data: { error: "plan_not_found" }, error: null });
    await expect(adminUpdateCompany({ company_id: "c1", name: "Novo" })).rejects.toThrow("plan_not_found");
  });

  it("monta os payloads das demais ações", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await adminSetSubscription({ company_id: "c1", status: "active" });
    expect(invoke).toHaveBeenLastCalledWith("admin-companies", {
      body: { action: "set_subscription", payload: { company_id: "c1", status: "active" } },
    });

    await adminSuspendCompany("c1");
    expect(invoke).toHaveBeenLastCalledWith("admin-companies", {
      body: { action: "suspend_company", payload: { company_id: "c1" } },
    });

    await adminReactivateCompany("c1");
    expect(invoke).toHaveBeenLastCalledWith("admin-companies", {
      body: { action: "reactivate_company", payload: { company_id: "c1" } },
    });

    await adminPromoteSuperAdmin({ email: "a@b.c", password: "x", name: "A" });
    expect(invoke).toHaveBeenLastCalledWith("admin-companies", {
      body: { action: "promote_super_admin", payload: { email: "a@b.c", password: "x", name: "A" } },
    });
  });
});
