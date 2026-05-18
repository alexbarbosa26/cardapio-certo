// Edge Function: gerenciamento de usuários (admin)
// Usa SERVICE_ROLE para criar/alterar usuários no Auth, exigindo
// que o chamador seja admin da mesma company.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization" }, 401);

  // Cliente autenticado como o usuário chamador (para validar identidade + RLS)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Confere que o caller é admin e pega company_id
  const { data: prof } = await admin
    .from("profiles").select("company_id").eq("id", callerId).maybeSingle();
  if (!prof) return json({ error: "Perfil não encontrado" }, 403);
  const { data: role } = await admin
    .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
  if (!role) return json({ error: "Apenas administradores podem realizar esta ação." }, 403);
  const companyId = prof.company_id as string;

  let body: { action?: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const { action, payload } = body;
  if (!action || !payload) return json({ error: "action/payload obrigatórios" }, 400);

  try {
    if (action === "create") {
      const { name, email, password, role: newRole } = payload as {
        name: string; email: string; password: string; role: "admin" | "staff";
      };
      if (!name || !email || !password || !newRole) return json({ error: "Campos obrigatórios" }, 400);
      if (password.length < 6) return json({ error: "Senha mínima 6 caracteres" }, 400);

      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });
      if (error) return json({ error: error.message }, 400);
      const uid = created.user!.id;

      await admin.from("profiles").upsert(
        { id: uid, company_id: companyId, name, email, status: "ativo" },
        { onConflict: "id" },
      );
      await admin.from("user_roles").upsert(
        { user_id: uid, role: newRole },
        { onConflict: "user_id,role" },
      );
      return json({ id: uid });
    }

    if (action === "update") {
      const { user_id, name, role: newRole, status, password } = payload as {
        user_id: string; name: string; role: "admin" | "staff";
        status: "ativo" | "inativo"; password?: string;
      };
      if (!user_id || !name || !newRole || !status) return json({ error: "Campos obrigatórios" }, 400);

      const { data: target } = await admin
        .from("profiles").select("id, company_id").eq("id", user_id).maybeSingle();
      if (!target || target.company_id !== companyId) return json({ error: "Usuário inválido" }, 403);

      await admin.from("profiles").update({ name, status }).eq("id", user_id);
      await admin.from("user_roles").delete().eq("user_id", user_id);
      await admin.from("user_roles").insert({ user_id, role: newRole });

      if (password && password.length >= 6) {
        const { error: pErr } = await admin.auth.admin.updateUserById(user_id, { password });
        if (pErr) return json({ error: pErr.message }, 400);
      }
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
