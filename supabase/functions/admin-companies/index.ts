import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function audit(
  admin: ReturnType<typeof createClient>,
  actorId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  await admin.from('audit_logs').insert({
    actor_user_id: actorId,
    actor_role: 'super_admin',
    company_id: (payload.company_id as string | null) ?? null,
    action,
    entity_type: (payload.entity_type as string) ?? null,
    entity_id: (payload.entity_id as string) ?? null,
    new_value: payload,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims } = await userClient.auth.getClaims(token);
    if (!claims?.claims?.sub) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: isSuper } = await admin.rpc('has_role', { _user_id: userId, _role: 'super_admin' });
    if (!isSuper) return json({ error: 'Forbidden: super admin only' }, 403);

    const { action, payload } = await req.json();
    if (!action || typeof action !== 'string') return json({ error: 'Missing action' }, 400);

    switch (action) {
      case 'create_company': {
        const { name, trade_name, responsible_name, responsible_email, responsible_phone,
                city, state, plan_id, admin_email, admin_password, admin_name,
                logo_url, primary_color, secondary_color, accent_color } = payload ?? {};
        if (!name || !admin_email || !admin_password || !admin_name)
          return json({ error: 'name, admin_name, admin_email, admin_password obrigatórios' }, 400);

        const { data: company, error: cErr } = await admin.from('companies').insert({
          name, trade_name, responsible_name, responsible_email, responsible_phone,
          city, state, logo_url, primary_color, secondary_color, accent_color,
          status: 'ativo',
        }).select().single();
        if (cErr) return json({ error: cErr.message }, 400);

        // settings padrão
        await admin.from('settings').insert({ company_id: company.id });

        // plano (usa Profissional como fallback)
        let planRow: { id: string } | null = null;
        if (plan_id) {
          const { data } = await admin.from('plans').select('id').eq('id', plan_id).maybeSingle();
          planRow = data;
        }
        if (!planRow) {
          const { data } = await admin.from('plans').select('id').eq('name', 'Profissional').maybeSingle();
          planRow = data;
        }
        if (planRow) {
          await admin.from('subscriptions').insert({
            company_id: company.id,
            plan_id: planRow.id,
            status: 'trialing',
            trial_ends_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
          });
        }

        // criar usuário admin da empresa
        const { data: created, error: uErr } = await admin.auth.admin.createUser({
          email: admin_email,
          password: admin_password,
          email_confirm: true,
          user_metadata: { name: admin_name },
        });
        if (uErr || !created.user) {
          await admin.from('companies').delete().eq('id', company.id);
          return json({ error: uErr?.message ?? 'Falha ao criar admin' }, 400);
        }

        await admin.from('profiles').insert({
          id: created.user.id,
          company_id: company.id,
          name: admin_name,
          email: admin_email,
          status: 'ativo',
        });
        await admin.from('user_roles').insert({ user_id: created.user.id, role: 'admin' });

        await audit(admin, userId, 'create_company', {
          company_id: company.id, entity_type: 'company', entity_id: company.id,
          admin_email,
        });
        return json({ company_id: company.id, admin_user_id: created.user.id });
      }

      case 'update_company': {
        const { company_id, settings: settingsPatch, ...fields } = payload ?? {};
        if (!company_id) return json({ error: 'company_id obrigatório' }, 400);
        const allowed = ['name','trade_name','document','responsible_name','responsible_email',
          'responsible_phone','city','state','logo_url','primary_color','secondary_color',
          'accent_color','status','internal_notes'];
        const update: Record<string, unknown> = {};
        for (const k of allowed) if (k in fields) update[k] = fields[k];
        const { data: before } = await admin.from('companies').select('*').eq('id', company_id).maybeSingle();
        if (Object.keys(update).length) {
          const { error } = await admin.from('companies').update(update).eq('id', company_id);
          if (error) return json({ error: error.message }, 400);
        }
        if (settingsPatch && typeof settingsPatch === 'object') {
          const settingsAllowed = ['display_name','receipt_message'];
          const sUpdate: Record<string, unknown> = {};
          for (const k of settingsAllowed) if (k in settingsPatch) sUpdate[k] = (settingsPatch as Record<string, unknown>)[k];
          if (Object.keys(sUpdate).length) {
            const { data: sExist } = await admin.from('settings').select('id').eq('company_id', company_id).maybeSingle();
            if (sExist) {
              await admin.from('settings').update(sUpdate).eq('company_id', company_id);
            } else {
              await admin.from('settings').insert({ company_id, ...sUpdate });
            }
          }
        }
        await admin.from('audit_logs').insert({
          actor_user_id: userId, actor_role: 'super_admin', company_id,
          action: 'update_company', entity_type: 'company', entity_id: company_id,
          old_value: before, new_value: { ...update, settings: settingsPatch ?? null },
        });
        return json({ ok: true });
      }

      case 'set_subscription': {
        const { company_id, plan_id, status, current_period_end, trial_ends_at, billing_cycle } = payload ?? {};
        if (!company_id) return json({ error: 'company_id obrigatório' }, 400);

        // cancela qualquer assinatura ativa atual
        const { data: existing } = await admin.from('subscriptions')
          .select('id').eq('company_id', company_id)
          .in('status', ['trialing','active','past_due','suspended']).maybeSingle();

        if (existing) {
          const update: Record<string, unknown> = {};
          if (plan_id) update.plan_id = plan_id;
          if (status) {
            update.status = status;
            if (status === 'suspended') update.suspended_at = new Date().toISOString();
            if (status === 'canceled') update.canceled_at = new Date().toISOString();
          }
          if (current_period_end) update.current_period_end = current_period_end;
          if (trial_ends_at) update.trial_ends_at = trial_ends_at;
          if (billing_cycle) update.billing_cycle = billing_cycle;
          const { error } = await admin.from('subscriptions').update(update).eq('id', existing.id);
          if (error) return json({ error: error.message }, 400);
        } else {
          if (!plan_id) return json({ error: 'plan_id obrigatório para criar assinatura' }, 400);
          const { error } = await admin.from('subscriptions').insert({
            company_id, plan_id,
            status: status ?? 'active',
            billing_cycle: billing_cycle ?? 'monthly',
            current_period_start: new Date().toISOString(),
            current_period_end: current_period_end ?? new Date(Date.now()+30*24*3600*1000).toISOString(),
            trial_ends_at,
          });
          if (error) return json({ error: error.message }, 400);
        }
        await audit(admin, userId, 'set_subscription', { company_id, entity_type: 'subscription', plan_id, status });
        return json({ ok: true });
      }

      case 'suspend_company': {
        const { company_id } = payload ?? {};
        if (!company_id) return json({ error: 'company_id obrigatório' }, 400);
        await admin.from('subscriptions')
          .update({ status: 'suspended', suspended_at: new Date().toISOString() })
          .eq('company_id', company_id)
          .in('status', ['trialing','active','past_due']);
        await audit(admin, userId, 'suspend_company', { company_id, entity_type: 'company', entity_id: company_id });
        return json({ ok: true });
      }

      case 'reactivate_company': {
        const { company_id } = payload ?? {};
        if (!company_id) return json({ error: 'company_id obrigatório' }, 400);
        await admin.from('subscriptions')
          .update({ status: 'active', suspended_at: null })
          .eq('company_id', company_id)
          .eq('status', 'suspended');
        await audit(admin, userId, 'reactivate_company', { company_id, entity_type: 'company', entity_id: company_id });
        return json({ ok: true });
      }

      case 'promote_super_admin': {
        // utilitário para criar/promover o super admin de demonstração via super admin já existente
        const { email, password, name } = payload ?? {};
        if (!email || !password || !name) return json({ error: 'email, password, name obrigatórios' }, 400);
        let userIdNew: string | null = null;
        const { data: list } = await admin.auth.admin.listUsers();
        const found = list.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
        if (found) {
          userIdNew = found.id;
          await admin.auth.admin.updateUserById(userIdNew, { password });
        } else {
          const { data: created, error } = await admin.auth.admin.createUser({
            email, password, email_confirm: true, user_metadata: { name },
          });
          if (error || !created.user) return json({ error: error?.message ?? 'falha' }, 400);
          userIdNew = created.user.id;
        }
        await admin.from('profiles').upsert({
          id: userIdNew, company_id: null, name, email, status: 'ativo',
        });
        await admin.from('user_roles').upsert({ user_id: userIdNew, role: 'super_admin' }, { onConflict: 'user_id,role' });
        await audit(admin, userId, 'promote_super_admin', { entity_type: 'user', entity_id: userIdNew, email });
        return json({ ok: true, user_id: userIdNew });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error('admin-companies error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
