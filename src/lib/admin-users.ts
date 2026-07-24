import { supabase } from "@/integrations/supabase/client";

type CreateInput = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "staff";
};

type UpdateInput = {
  user_id: string;
  name: string;
  role: "admin" | "staff";
  status: "ativo" | "inativo";
  password?: string;
};

export type GlobalRole = "admin" | "staff" | "super_admin";

export interface GlobalUserRow {
  id: string;
  name: string;
  email: string;
  status: string;
  created_at: string;
  company_id: string | null;
  company_name: string | null;
  role: GlobalRole | null;
  last_sign_in_at: string | null;
}

async function callOnce(action: string, payload: Record<string, unknown>) {
  return supabase.functions.invoke("admin-users", { body: { action, payload } });
}

async function extractError(error: unknown, data: unknown): Promise<{ msg: string; status?: number }> {
  let responseError: string | undefined;
  let status: number | undefined;
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    status = context.status;
    try {
      const body = await context.clone().json();
      if (body && typeof body === "object" && "error" in body) {
        responseError = String((body as Record<string, unknown>).error);
      }
    } catch {
      try { responseError = await context.clone().text(); } catch { /* ignore */ }
    }
  }
  const dataErr = data && typeof data === "object" && "error" in (data as Record<string, unknown>)
    ? String((data as Record<string, unknown>).error)
    : undefined;
  const msg =
    dataErr ||
    responseError ||
    (error as { message?: string })?.message ||
    "Erro ao chamar admin-users.";
  return { msg, status };
}

async function invoke<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  let { data, error } = await callOnce(action, payload);
  if (error) {
    const { msg, status } = await extractError(error, data);
    // Token revogado/expirado: força refresh e tenta novamente uma vez.
    if (status === 401 || /unauthorized|jwt|session/i.test(msg)) {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr || !refreshed.session) {
        await supabase.auth.signOut().catch(() => {});
        throw new Error("Sua sessão expirou. Faça login novamente.");
      }
      ({ data, error } = await callOnce(action, payload));
      if (error) {
        const retry = await extractError(error, data);
        throw new Error(retry.msg);
      }
    } else {
      throw new Error(msg);
    }
  }
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>).error));
  }
  return data as T;
}

export function adminCreateUser(input: CreateInput) {
  return invoke<{ id: string }>("create", input);
}

export function adminUpdateUser(input: UpdateInput) {
  return invoke<{ ok: true }>("update", input);
}

// ============ Super admin (global) ============

export function adminListAllUsers(filters: {
  search?: string; company_id?: string; role?: string; status?: string;
} = {}) {
  return invoke<{ users: GlobalUserRow[] }>("list_all", filters);
}

export function adminCreateGlobalUser(input: {
  name: string; email: string; password: string;
  company_id: string | null; role: GlobalRole;
}) {
  return invoke<{ id: string }>("create_global", input);
}

export function adminUpdateGlobalUser(input: {
  user_id: string; name: string; company_id: string | null;
  role: GlobalRole; status: "ativo" | "inativo";
}) {
  return invoke<{ ok: true }>("update_global", input);
}

export function adminResetPasswordGlobal(user_id: string, password: string) {
  return invoke<{ ok: true }>("reset_password_global", { user_id, password });
}
