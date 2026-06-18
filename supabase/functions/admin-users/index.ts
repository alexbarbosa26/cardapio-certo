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

  const ALLOWED_ROLES = ["admin", "staff"] as const;
  type AllowedRole = typeof ALLOWED_ROLES[number];
  const isAllowedRole = (r: unknown): r is AllowedRole =>
    typeof r === "string" && (ALLOWED_ROLES as readonly string[]).includes(r);

  try {
    if (action === "create") {
      const { name, email, password, role: newRole } = payload as {
        name: string; email: string; password: string; role: "admin" | "staff";
      };
      if (!name || !email || !password || !newRole) return json({ error: "Campos obrigatórios" }, 400);
      if (!isAllowedRole(newRole)) return json({ error: "Perfil inválido. Use 'admin' ou 'staff'." }, 400);
      if (password.length < 6) return json({ error: "Senha mínima 6 caracteres" }, 400);

      // Pre-check plan limit for a friendlier error before creating the auth user
      const { data: lim } = await admin.rpc("company_plan_limits", { _company: companyId });
      const maxUsers = (lim?.[0]?.max_users ?? null) as number | null;
      if (maxUsers != null) {
        const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId);
        if ((count ?? 0) >= maxUsers) {
          return json({ error: `Seu plano atual não permite adicionar mais usuários (limite: ${maxUsers}).` }, 400);
        }
      }

      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });
      if (error) {
        const msg = /weak|known/i.test(error.message)
          ? "Senha muito fraca ou comum. Escolha uma senha mais forte (use letras, números e símbolos)."
          : error.message;
        return json({ error: msg }, 400);
      }
      const uid = created.user!.id;

      const { error: pErr } = await admin.from("profiles").upsert(
        { id: uid, company_id: companyId, name, email, status: "ativo" },
        { onConflict: "id" },
      );
      if (pErr) {
        // Cleanup the auth user if profile insert fails (e.g. plan limit race)
        await admin.auth.admin.deleteUser(uid);
        return json({ error: pErr.message }, 400);
      }
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
      if (!isAllowedRole(newRole)) return json({ error: "Perfil inválido. Use 'admin' ou 'staff'." }, 400);

      const { data: target } = await admin
        .from("profiles").select("id, company_id").eq("id", user_id).maybeSingle();
      if (!target || target.company_id !== companyId) return json({ error: "Usuário inválido" }, 403);

      await admin.from("profiles").update({ name, status }).eq("id", user_id);
      await admin.from("user_roles").delete().eq("user_id", user_id);
      await admin.from("user_roles").insert({ user_id, role: newRole });

      // Sync access at the Auth layer so deactivated users cannot log in.
      if (status === "inativo") {
        const { error: bErr } = await admin.auth.admin.updateUserById(user_id, {
          ban_duration: "876000h", // ~100 years (Supabase requires a duration string)
        });
        if (bErr) return json({ error: bErr.message }, 400);
      } else {
        const { error: uErr } = await admin.auth.admin.updateUserById(user_id, {
          ban_duration: "none",
        });
        if (uErr) return json({ error: uErr.message }, 400);
      }

      if (password && password.length >= 6) {
        const { error: pErr } = await admin.auth.admin.updateUserById(user_id, { password });
        if (pErr) {
          const msg = /weak|known/i.test(pErr.message)
            ? "Senha muito fraca ou comum. Escolha uma senha mais forte (use letras, números e símbolos)."
            : pErr.message;
          return json({ error: msg }, 400);
        }
      }
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
