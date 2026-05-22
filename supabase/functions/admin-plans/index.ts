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
  entity_id: string | null,
  oldVal: unknown,
  newVal: unknown,
) {
  await admin.from('audit_logs').insert({
    actor_user_id: actorId,
    actor_role: 'super_admin',
    company_id: null,
    action,
    entity_type: 'plan',
    entity_id,
    old_value: oldVal as Record<string, unknown> | null,
    new_value: newVal as Record<string, unknown> | null,
  });
}

const ALLOWED_FIELDS = [
  'name', 'slug', 'short_description', 'full_description', 'description',
  'monthly_price', 'annual_price', 'trial_days',
  'max_users', 'max_tables', 'max_open_tabs', 'max_products',
  'allow_tables_module', 'allow_tabs_module', 'allow_kitchen_module',
  'allow_cash_register_module', 'allow_advanced_dashboard', 'allow_reports',
  'allow_visual_customization', 'support_level',
  'is_featured', 'show_on_landing_page', 'display_order', 'status',
] as const;

function pickFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) if (k in input) out[k] = input[k];
  return out;
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
    if (!action) return json({ error: 'Missing action' }, 400);

    switch (action) {
      case 'create_plan': {
        const fields = pickFields(payload ?? {});
        if (!fields.name) return json({ error: 'name é obrigatório' }, 400);
        if (fields.slug) {
          const { data: dup } = await admin.from('plans').select('id').ilike('slug', String(fields.slug)).maybeSingle();
          if (dup) return json({ error: 'Já existe um plano com este slug.' }, 400);
        }
        const { data, error } = await admin.from('plans').insert(fields).select().single();
        if (error) return json({ error: error.message }, 400);
        await audit(admin, userId, 'create_plan', data.id, null, data);
        return json({ plan: data });
      }

      case 'update_plan': {
        const { plan_id, ...rest } = payload ?? {};
        if (!plan_id) return json({ error: 'plan_id é obrigatório' }, 400);
        const fields = pickFields(rest);
        if (fields.slug) {
          const { data: dup } = await admin.from('plans').select('id').ilike('slug', String(fields.slug)).neq('id', plan_id).maybeSingle();
          if (dup) return json({ error: 'Já existe outro plano com este slug.' }, 400);
        }
        const { data: before } = await admin.from('plans').select('*').eq('id', plan_id).maybeSingle();
        const { data, error } = await admin.from('plans').update(fields).eq('id', plan_id).select().single();
        if (error) return json({ error: error.message }, 400);
        await audit(admin, userId, 'update_plan', plan_id, before, data);
        return json({ plan: data });
      }

      case 'set_plan_status': {
        const { plan_id, status } = payload ?? {};
        if (!plan_id || !status) return json({ error: 'plan_id e status são obrigatórios' }, 400);
        if (!['ativo', 'inativo'].includes(status)) return json({ error: 'status inválido' }, 400);
        const { data: before } = await admin.from('plans').select('status').eq('id', plan_id).maybeSingle();
        const { data, error } = await admin.from('plans').update({ status }).eq('id', plan_id).select().single();
        if (error) return json({ error: error.message }, 400);
        await audit(admin, userId, 'set_plan_status', plan_id, before, { status });
        return json({ plan: data });
      }

      case 'delete_plan': {
        const { plan_id } = payload ?? {};
        if (!plan_id) return json({ error: 'plan_id é obrigatório' }, 400);
        const { count } = await admin.from('subscriptions').select('id', { count: 'exact', head: true }).eq('plan_id', plan_id);
        if ((count ?? 0) > 0) {
          return json({ error: 'Este plano possui assinaturas vinculadas. Desative-o em vez de excluir.' }, 400);
        }
        const { data: before } = await admin.from('plans').select('*').eq('id', plan_id).maybeSingle();
        const { error } = await admin.from('plans').delete().eq('id', plan_id);
        if (error) return json({ error: error.message }, 400);
        await audit(admin, userId, 'delete_plan', plan_id, before, null);
        return json({ ok: true });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error('admin-plans error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
