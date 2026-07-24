// Edge Function: gerenciamento de usuários
// - Admin de empresa: gerencia usuários da própria empresa (actions "create", "update")
// - Super Admin global: gerencia usuários de qualquer empresa (actions "list_all",
//   "create_global", "update_global", "reset_password_global")
// Todas as validações críticas ocorrem no servidor. SERVICE_ROLE nunca sai do backend.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

function translatePasswordError(msg: string): string {
  if (/weak|known|pwned|compromised|leaked|breach/i.test(msg))
    return "Senha recusada: é muito fraca ou consta em vazamentos públicos. Use no mínimo 8 caracteres misturando letras maiúsculas e minúsculas, números e símbolos.";
  if (/at least \d+ characters|too short/i.test(msg))
    return "Senha muito curta. Use pelo menos 8 caracteres combinando letras, números e símbolos.";
  return msg;
}

async function audit(
  admin: SupabaseClient,
  actorId: string,
  actorRole: string,
  action: string,
  entity_id: string | null,
  company_id: string | null,
  data: Record<string, unknown>,
) {
  try {
    await admin.from("audit_logs").insert({
      actor_user_id: actorId,
      actor_role: actorRole,
      company_id,
      action,
      entity_type: "user",
      entity_id,
      new_value: data,
    });
  } catch { /* auditoria não pode quebrar a operação */ }
}

async function countActiveSuperAdmins(admin: SupabaseClient): Promise<number> {
  const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
  const ids = (roles ?? []).map((r) => r.user_id as string);
  if (!ids.length) return 0;
  const { data: profs } = await admin.from("profiles").select("id").in("id", ids).eq("status", "ativo");
  return (profs ?? []).length;
}

async function getTargetRole(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return (data?.role as string) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: prof } = await admin.from("profiles").select("company_id").eq("id", callerId).maybeSingle();
  if (!prof) return json({ error: "Perfil não encontrado" }, 403);
  const { data: rolesRows } = await admin.from("user_roles").select("role").eq("user_id", callerId);
  const callerRoles = new Set((rolesRows ?? []).map((r) => r.role as string));
  const isSuper = callerRoles.has("super_admin");
  const isAdmin = callerRoles.has("admin");
  if (!isSuper && !isAdmin) return json({ error: "Apenas administradores podem realizar esta ação." }, 403);
  const callerCompanyId = prof.company_id as string | null;

  let body: { action?: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const { action, payload } = body;
  if (!action || !payload) return json({ error: "action/payload obrigatórios" }, 400);

  const COMPANY_ROLES = ["admin", "staff"] as const;
  const GLOBAL_ROLES = ["admin", "staff", "super_admin"] as const;
  type CompanyRole = typeof COMPANY_ROLES[number];
  type GlobalRole = typeof GLOBAL_ROLES[number];
  const isCompanyRole = (r: unknown): r is CompanyRole =>
    typeof r === "string" && (COMPANY_ROLES as readonly string[]).includes(r);
  const isGlobalRole = (r: unknown): r is GlobalRole =>
    typeof r === "string" && (GLOBAL_ROLES as readonly string[]).includes(r);

  try {
    // ============ AÇÕES DE ADMIN DE EMPRESA ============
    if (action === "create") {
      if (!isAdmin && !isSuper) return json({ error: "Sem permissão" }, 403);
      if (!callerCompanyId && !isSuper) return json({ error: "Empresa não encontrada" }, 403);
      const companyId = callerCompanyId!;
      const { name, email, password, role: newRole } = payload as {
        name: string; email: string; password: string; role: CompanyRole;
      };
      if (!name || !email || !password || !newRole) return json({ error: "Campos obrigatórios" }, 400);
      if (!isCompanyRole(newRole)) return json({ error: "Perfil inválido. Use 'admin' ou 'staff'." }, 400);
      if (password.length < 8) return json({ error: "Senha muito curta. Use pelo menos 8 caracteres." }, 400);

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
      if (error) return json({ error: translatePasswordError(error.message) }, 400);
      const uid = created.user!.id;
      const { error: pErr } = await admin.from("profiles").upsert(
        { id: uid, company_id: companyId, name, email, status: "ativo" },
        { onConflict: "id" },
      );
      if (pErr) {
        await admin.auth.admin.deleteUser(uid);
        return json({ error: pErr.message }, 400);
      }
      await admin.from("user_roles").upsert({ user_id: uid, role: newRole }, { onConflict: "user_id,role" });
      await audit(admin, callerId, "admin", "user.created", uid, companyId, { name, email, role: newRole });
      return json({ id: uid });
    }

    if (action === "update") {
      if (!isAdmin && !isSuper) return json({ error: "Sem permissão" }, 403);
      const { user_id, name, role: newRole, status, password } = payload as {
        user_id: string; name: string; role: CompanyRole;
        status: "ativo" | "inativo"; password?: string;
      };
      if (!user_id || !name || !newRole || !status) return json({ error: "Campos obrigatórios" }, 400);
      if (!isCompanyRole(newRole)) return json({ error: "Perfil inválido." }, 400);

      const { data: target } = await admin.from("profiles").select("id, company_id").eq("id", user_id).maybeSingle();
      if (!target) return json({ error: "Usuário inválido" }, 403);
      if (!isSuper && target.company_id !== callerCompanyId) return json({ error: "Usuário inválido" }, 403);

      // Bloqueio: admin de empresa não pode editar super_admin nem promover a super_admin.
      const targetRole = await getTargetRole(admin, user_id);
      if (targetRole === "super_admin" && !isSuper)
        return json({ error: "Não autorizado" }, 403);

      await admin.from("profiles").update({ name, status }).eq("id", user_id);
      await admin.from("user_roles").delete().eq("user_id", user_id);
      await admin.from("user_roles").insert({ user_id, role: newRole });

      if (status === "inativo") {
        const { error: bErr } = await admin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
        if (bErr) return json({ error: bErr.message }, 400);
      } else {
        const { error: uErr } = await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
        if (uErr) return json({ error: uErr.message }, 400);
      }

      if (password && password.length >= 8) {
        const { error: pErr } = await admin.auth.admin.updateUserById(user_id, { password });
        if (pErr) return json({ error: translatePasswordError(pErr.message) }, 400);
      }
      await audit(admin, callerId, isSuper ? "super_admin" : "admin", "user.updated",
        user_id, target.company_id as string, { name, role: newRole, status, password_changed: !!password });
      return json({ ok: true });
    }

    // ============ AÇÕES DE SUPER ADMIN ============
    if (!isSuper) return json({ error: "Apenas super admin pode acessar." }, 403);

    if (action === "list_all") {
      const { search, company_id, role, status } = (payload as {
        search?: string; company_id?: string; role?: string; status?: string;
      });
      let q = admin.from("profiles")
        .select("id, name, email, status, created_at, company_id, companies(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (company_id) q = q.eq("company_id", company_id);
      if (status) q = q.eq("status", status);
      if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      const { data: profs, error } = await q;
      if (error) return json({ error: error.message }, 400);
      const ids = (profs ?? []).map((p) => p.id as string);
      let rolesMap: Record<string, string> = {};
      if (ids.length) {
        const { data: rr } = await admin.from("user_roles").select("user_id, role").in("user_id", ids);
        rolesMap = Object.fromEntries((rr ?? []).map((r) => [r.user_id as string, r.role as string]));
      }
      // Fetch last_sign_in_at via Auth admin listUsers (paginado, até 1000).
      const lastSignInMap: Record<string, string | null> = {};
      try {
        for (let page = 1; page <= 10; page++) {
          const { data: au } = await admin.auth.admin.listUsers({ page, perPage: 100 });
          const users = au?.users ?? [];
          for (const u of users) lastSignInMap[u.id] = u.last_sign_in_at ?? null;
          if (users.length < 100) break;
        }
      } catch { /* opcional */ }

      let rows = (profs ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        email: p.email as string,
        status: p.status as string,
        created_at: p.created_at as string,
        company_id: p.company_id as string | null,
        company_name: (p as { companies?: { name?: string } }).companies?.name ?? null,
        role: rolesMap[p.id as string] ?? null,
        last_sign_in_at: lastSignInMap[p.id as string] ?? null,
      }));
      if (role) rows = rows.filter((r) => r.role === role);
      return json({ users: rows });
    }

    if (action === "create_global") {
      const { name, email, password, company_id, role: newRole } = payload as {
        name: string; email: string; password: string; company_id: string | null; role: GlobalRole;
      };
      if (!name || !email || !password || !newRole) return json({ error: "Campos obrigatórios" }, 400);
      if (!isGlobalRole(newRole)) return json({ error: "Perfil inválido." }, 400);
      if (password.length < 8) return json({ error: "Senha muito curta. Use pelo menos 8 caracteres." }, 400);
      if (newRole !== "super_admin" && !company_id)
        return json({ error: "Selecione uma empresa para admin/staff." }, 400);

      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });
      if (error) return json({ error: translatePasswordError(error.message) }, 400);
      const uid = created.user!.id;

      const { error: pErr } = await admin.from("profiles").upsert(
        { id: uid, company_id: newRole === "super_admin" ? null : company_id, name, email, status: "ativo" },
        { onConflict: "id" },
      );
      if (pErr) {
        await admin.auth.admin.deleteUser(uid);
        return json({ error: pErr.message }, 400);
      }
      await admin.from("user_roles").upsert({ user_id: uid, role: newRole }, { onConflict: "user_id,role" });
      await audit(admin, callerId, "super_admin", "user.created", uid, company_id ?? null,
        { name, email, role: newRole, company_id });
      return json({ id: uid });
    }

    if (action === "update_global") {
      const { user_id, name, company_id, role: newRole, status } = payload as {
        user_id: string; name: string; company_id: string | null;
        role: GlobalRole; status: "ativo" | "inativo";
      };
      if (!user_id || !name || !newRole || !status) return json({ error: "Campos obrigatórios" }, 400);
      if (!isGlobalRole(newRole)) return json({ error: "Perfil inválido." }, 400);
      if (newRole !== "super_admin" && !company_id)
        return json({ error: "Empresa é obrigatória para admin/staff." }, 400);

      const { data: target } = await admin.from("profiles")
        .select("id, company_id, status").eq("id", user_id).maybeSingle();
      if (!target) return json({ error: "Usuário não encontrado" }, 404);
      const targetRole = await getTargetRole(admin, user_id);

      // Proteção do último super_admin ativo
      const willLoseSuper = targetRole === "super_admin" && newRole !== "super_admin";
      const willInactivate = target.status === "ativo" && status === "inativo" && targetRole === "super_admin";
      if (willLoseSuper || willInactivate) {
        const total = await countActiveSuperAdmins(admin);
        if (total <= 1) return json({ error: "Não é possível remover o último super admin ativo." }, 400);
      }

      await admin.from("profiles").update({
        name,
        company_id: newRole === "super_admin" ? null : company_id,
        status,
      }).eq("id", user_id);
      await admin.from("user_roles").delete().eq("user_id", user_id);
      await admin.from("user_roles").insert({ user_id, role: newRole });

      if (status === "inativo") {
        await admin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      } else {
        await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      await audit(admin, callerId, "super_admin", "user.updated", user_id, company_id ?? null,
        { name, role: newRole, status, company_id, previous_role: targetRole });
      return json({ ok: true });
    }

    if (action === "reset_password_global") {
      const { user_id, password } = payload as { user_id: string; password: string };
      if (!user_id || !password) return json({ error: "Campos obrigatórios" }, 400);
      if (password.length < 8) return json({ error: "Senha muito curta. Use pelo menos 8 caracteres." }, 400);
      const { error: pErr } = await admin.auth.admin.updateUserById(user_id, { password });
      if (pErr) return json({ error: translatePasswordError(pErr.message) }, 400);
      await audit(admin, callerId, "super_admin", "user.password_reset", user_id, null, {});
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
