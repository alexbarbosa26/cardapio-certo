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

async function invoke<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, payload },
  });
  if (error) {
    let responseError: string | undefined;
    const context = (error as { context?: unknown }).context;

    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        if (body && typeof body === "object" && "error" in body) {
          responseError = String((body as Record<string, unknown>).error);
        }
      } catch {
        try {
          responseError = await context.clone().text();
        } catch {
          responseError = undefined;
        }
      }
    }

    // edge function returns { error } on 4xx — surface that message when available
    const msg =
      (data &&
        typeof data === "object" &&
        "error" in (data as Record<string, unknown>) &&
        String((data as Record<string, unknown>).error)) ||
      responseError ||
      error.message ||
      "Erro ao chamar admin-users.";
    throw new Error(msg);
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
