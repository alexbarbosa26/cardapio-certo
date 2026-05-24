// MesaChef — Billing edge function (simulated payment provider).
// Public endpoints (signup_and_checkout, get_session, simulate_payment) do not require JWT.
// Authenticated endpoints (change_plan, cancel_subscription, reactivate_subscription)
// validate the JWT in code.
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

type Cycle = 'monthly' | 'annual';

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function getUser(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data } = await c.auth.getClaims(token);
  return (data?.claims?.sub as string | undefined) ?? null;
}

async function logEvent(
  a: ReturnType<typeof admin>,
  ev: {
    company_id: string;
    subscription_id?: string | null;
    event_type: string;
    description?: string;
    old_status?: string | null;
    new_status?: string | null;
    old_plan_id?: string | null;
    new_plan_id?: string | null;
    created_by_user_id?: string | null;
  },
) {
  await a.from('subscription_events').insert(ev);
}

async function audit(
  a: ReturnType<typeof admin>,
  actorId: string | null,
  action: string,
  payload: Record<string, unknown>,
) {
  await a.from('audit_logs').insert({
    actor_user_id: actorId,
    actor_role: payload.actor_role ?? 'system',
    company_id: (payload.company_id as string | null) ?? null,
    action,
    entity_type: (payload.entity_type as string) ?? null,
    entity_id: (payload.entity_id as string) ?? null,
    new_value: payload,
  });
}

function periodEnd(cycle: Cycle, from = new Date()): Date {
  const d = new Date(from);
  if (cycle === 'annual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { action, payload } = await req.json();
    if (!action || typeof action !== 'string') return json({ error: 'Missing action' }, 400);
    const a = admin();
    const actorId = await getUser(req.headers.get('Authorization'));

    switch (action) {
      // ---------------- PUBLIC: create company + admin + checkout session
      case 'signup_and_checkout': {
        const {
          plan_slug, billing_cycle = 'monthly',
          company_name, trade_name, document, responsible_name, responsible_phone,
          city, state, admin_email, admin_password,
        } = payload ?? {};
        if (!plan_slug || !company_name || !responsible_name || !admin_email || !admin_password) {
          return json({ error: 'Campos obrigatórios ausentes.' }, 400);
        }
        if (String(admin_password).length < 6) {
          return json({ error: 'A senha deve ter pelo menos 6 caracteres.' }, 400);
        }

        const { data: plan } = await a.from('plans')
          .select('id, name, slug, monthly_price, annual_price, trial_days, status, show_on_landing_page')
          .eq('slug', plan_slug).maybeSingle();
        if (!plan || plan.status !== 'ativo' || !plan.show_on_landing_page) {
          return json({ error: 'Plano não disponível para contratação.' }, 400);
        }

        const cycle = (billing_cycle === 'annual' ? 'annual' : 'monthly') as Cycle;
        const amount = cycle === 'annual' ? Number(plan.annual_price) : Number(plan.monthly_price);

        // company
        const { data: company, error: cErr } = await a.from('companies').insert({
          name: company_name, trade_name, document,
          responsible_name, responsible_email: admin_email, responsible_phone,
          city, state, status: 'trial',
        }).select().single();
        if (cErr) return json({ error: cErr.message }, 400);

        await a.from('settings').insert({ company_id: company.id });

        // create auth user
        const { data: created, error: uErr } = await a.auth.admin.createUser({
          email: admin_email, password: admin_password, email_confirm: true,
          user_metadata: { name: responsible_name },
        });
        if (uErr || !created.user) {
          await a.from('companies').delete().eq('id', company.id);
          return json({ error: uErr?.message ?? 'Falha ao criar usuário (e-mail já em uso?).' }, 400);
        }
        await a.from('profiles').insert({
          id: created.user.id, company_id: company.id,
          name: responsible_name, email: admin_email, status: 'ativo',
        });
        await a.from('user_roles').insert({ user_id: created.user.id, role: 'admin' });

        // subscription trialing
        const trialEnd = new Date(Date.now() + (plan.trial_days ?? 7) * 86400000);
        const { data: sub, error: sErr } = await a.from('subscriptions').insert({
          company_id: company.id, plan_id: plan.id,
          status: 'trialing', billing_cycle: cycle, amount,
          trial_starts_at: new Date().toISOString(),
          trial_ends_at: trialEnd.toISOString(),
          current_period_start: new Date().toISOString(),
          current_period_end: trialEnd.toISOString(),
          payment_provider: 'simulated',
        }).select().single();
        if (sErr) return json({ error: sErr.message }, 400);

        // checkout session
        const { data: session, error: chErr } = await a.from('checkout_sessions').insert({
          company_id: company.id, plan_id: plan.id, subscription_id: sub.id,
          provider: 'simulated', status: 'pending',
          billing_cycle: cycle, amount,
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        }).select().single();
        if (chErr) return json({ error: chErr.message }, 400);

        await logEvent(a, {
          company_id: company.id, subscription_id: sub.id,
          event_type: 'subscription_created', description: `Assinatura criada (${plan.name})`,
          new_status: 'trialing', new_plan_id: plan.id, created_by_user_id: created.user.id,
        });
        await audit(a, created.user.id, 'signup_and_checkout', {
          company_id: company.id, entity_type: 'subscription', entity_id: sub.id, plan_slug, cycle,
        });

        return json({
          checkout_session_id: session.id,
          company_id: company.id,
          user_id: created.user.id,
        });
      }

      // ---------------- PUBLIC: read checkout session (no sensitive fields)
      case 'get_session': {
        const { session_id } = payload ?? {};
        if (!session_id) return json({ error: 'session_id obrigatório' }, 400);
        const { data, error } = await a.from('checkout_sessions')
          .select('id, status, billing_cycle, amount, plan_id, company_id, subscription_id, plans(name, slug), companies(name)')
          .eq('id', session_id).maybeSingle();
        if (error || !data) return json({ error: 'Sessão não encontrada.' }, 404);
        return json({ session: data });
      }

      // ---------------- simulate payment outcome (gated by env flag)
      case 'simulate_payment': {
        const simEnabled = (Deno.env.get('PAYMENT_SIMULATION_ENABLED') ?? 'true').toLowerCase() === 'true';
        if (!simEnabled) {
          return json({ error: 'Simulação de pagamento desabilitada.' }, 403);
        }
        const { session_id, outcome } = payload ?? {};
        if (!session_id || !['approve', 'pending', 'reject'].includes(outcome)) {
          return json({ error: 'Parâmetros inválidos.' }, 400);
        }
        const { data: session } = await a.from('checkout_sessions')
          .select('*').eq('id', session_id).maybeSingle();
        if (!session) return json({ error: 'Sessão não encontrada.' }, 404);
        // Only allow simulating a session that is still pending — prevents toggling existing paid subs.
        if (session.status !== 'pending') {
          return json({ error: 'Sessão não está pendente.' }, 409);
        }

        const cycle = (session.billing_cycle === 'annual' ? 'annual' : 'monthly') as Cycle;

        if (outcome === 'approve') {
          const periodStart = new Date();
          const periodEndDate = periodEnd(cycle, periodStart);
          await a.from('subscription_payments').insert({
            company_id: session.company_id, subscription_id: session.subscription_id,
            checkout_session_id: session.id, provider: 'simulated',
            amount: session.amount, status: 'paid', payment_method: 'simulated_card',
            paid_at: new Date().toISOString(),
            raw_response: { simulated: true, outcome },
          });
          await a.from('checkout_sessions').update({ status: 'paid' }).eq('id', session.id);
          await a.from('subscriptions').update({
            status: 'active', billing_cycle: cycle,
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEndDate.toISOString(),
            next_billing_date: periodEndDate.toISOString(),
            cancel_at_period_end: false, suspended_at: null, canceled_at: null,
          }).eq('id', session.subscription_id);
          await a.from('companies').update({ status: 'ativo' }).eq('id', session.company_id);
          await logEvent(a, {
            company_id: session.company_id, subscription_id: session.subscription_id,
            event_type: 'payment_approved', new_status: 'active',
            description: 'Pagamento simulado aprovado',
          });
        } else if (outcome === 'pending') {
          await a.from('subscription_payments').insert({
            company_id: session.company_id, subscription_id: session.subscription_id,
            checkout_session_id: session.id, provider: 'simulated',
            amount: session.amount, status: 'pending',
            due_date: new Date(Date.now() + 3 * 86400000).toISOString(),
            raw_response: { simulated: true, outcome },
          });
          await a.from('subscriptions').update({ status: 'pending_payment' })
            .eq('id', session.subscription_id);
          await logEvent(a, {
            company_id: session.company_id, subscription_id: session.subscription_id,
            event_type: 'payment_pending', new_status: 'pending_payment',
            description: 'Pagamento simulado pendente',
          });
        } else {
          await a.from('subscription_payments').insert({
            company_id: session.company_id, subscription_id: session.subscription_id,
            checkout_session_id: session.id, provider: 'simulated',
            amount: session.amount, status: 'failed',
            raw_response: { simulated: true, outcome },
          });
          await a.from('checkout_sessions').update({ status: 'failed' }).eq('id', session.id);
          await a.from('subscriptions').update({ status: 'failed' })
            .eq('id', session.subscription_id);
          await logEvent(a, {
            company_id: session.company_id, subscription_id: session.subscription_id,
            event_type: 'payment_rejected', new_status: 'failed',
            description: 'Pagamento simulado recusado',
          });
        }
        await audit(a, actorId, 'simulate_payment', {
          company_id: session.company_id, entity_type: 'checkout_session',
          entity_id: session.id, outcome,
        });
        return json({ ok: true });
      }

      // ---------------- AUTH: company admin changes plan (simulated)
      case 'change_plan': {
        if (!actorId) return json({ error: 'Unauthorized' }, 401);
        const { new_plan_id } = payload ?? {};
        if (!new_plan_id) return json({ error: 'new_plan_id obrigatório' }, 400);

        const { data: prof } = await a.from('profiles').select('company_id').eq('id', actorId).maybeSingle();
        if (!prof?.company_id) return json({ error: 'Sem empresa.' }, 403);
        const { data: isAdmin } = await a.rpc('has_role', { _user_id: actorId, _role: 'admin' });
        if (!isAdmin) return json({ error: 'Apenas admin pode alterar plano.' }, 403);

        const { data: sub } = await a.from('subscriptions')
          .select('*').eq('company_id', prof.company_id)
          .in('status', ['trialing', 'active', 'past_due', 'pending_payment'])
          .order('created_at', { ascending: false }).maybeSingle();
        if (!sub) return json({ error: 'Assinatura ativa não encontrada.' }, 404);

        const { data: newPlan } = await a.from('plans')
          .select('id, name, monthly_price, annual_price, max_users, max_tables, max_open_tabs, status')
          .eq('id', new_plan_id).maybeSingle();
        if (!newPlan || newPlan.status !== 'ativo') return json({ error: 'Plano inválido.' }, 400);

        // Limit check
        const [{ count: uCnt }, { count: tCnt }, { count: oCnt }] = await Promise.all([
          a.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', prof.company_id),
          a.from('tables').select('id', { count: 'exact', head: true }).eq('company_id', prof.company_id),
          a.from('customer_tabs').select('id', { count: 'exact', head: true })
            .eq('company_id', prof.company_id).eq('status', 'aberta'),
        ]);
        const exceed: string[] = [];
        if (newPlan.max_users != null && (uCnt ?? 0) > newPlan.max_users)
          exceed.push(`usuários (${uCnt}/${newPlan.max_users})`);
        if (newPlan.max_tables != null && (tCnt ?? 0) > newPlan.max_tables)
          exceed.push(`mesas (${tCnt}/${newPlan.max_tables})`);
        if (newPlan.max_open_tabs != null && (oCnt ?? 0) > newPlan.max_open_tabs)
          exceed.push(`comandas abertas (${oCnt}/${newPlan.max_open_tabs})`);
        if (exceed.length) {
          return json({ error: `Uso atual excede o novo plano: ${exceed.join(', ')}.` }, 400);
        }

        const cycle = (sub.billing_cycle === 'annual' ? 'annual' : 'monthly') as Cycle;
        const amount = cycle === 'annual' ? Number(newPlan.annual_price) : Number(newPlan.monthly_price);
        const oldPlanId = sub.plan_id;

        await a.from('subscriptions').update({
          plan_id: newPlan.id, amount,
        }).eq('id', sub.id);

        await a.from('subscription_payments').insert({
          company_id: prof.company_id, subscription_id: sub.id,
          provider: 'simulated', amount, status: 'paid',
          payment_method: 'simulated_change_plan', paid_at: new Date().toISOString(),
          raw_response: { simulated: true, change_plan: true },
        });

        await logEvent(a, {
          company_id: prof.company_id, subscription_id: sub.id,
          event_type: 'plan_changed', description: `Plano alterado para ${newPlan.name}`,
          old_plan_id: oldPlanId, new_plan_id: newPlan.id,
          created_by_user_id: actorId,
        });
        await audit(a, actorId, 'change_plan', {
          company_id: prof.company_id, entity_type: 'subscription', entity_id: sub.id,
          old_plan_id: oldPlanId, new_plan_id: newPlan.id, actor_role: 'admin',
        });
        return json({ ok: true });
      }

      // ---------------- AUTH: cancel subscription
      case 'cancel_subscription': {
        if (!actorId) return json({ error: 'Unauthorized' }, 401);
        const { reason, cancel_at_period_end = true } = payload ?? {};
        const { data: prof } = await a.from('profiles').select('company_id').eq('id', actorId).maybeSingle();
        if (!prof?.company_id) return json({ error: 'Sem empresa.' }, 403);
        const { data: isAdmin } = await a.rpc('has_role', { _user_id: actorId, _role: 'admin' });
        if (!isAdmin) return json({ error: 'Apenas admin pode cancelar.' }, 403);

        const { data: sub } = await a.from('subscriptions').select('*')
          .eq('company_id', prof.company_id)
          .in('status', ['trialing', 'active', 'past_due', 'pending_payment'])
          .order('created_at', { ascending: false }).maybeSingle();
        if (!sub) return json({ error: 'Assinatura não encontrada.' }, 404);

        if (cancel_at_period_end) {
          await a.from('subscriptions').update({
            cancel_at_period_end: true,
            cancellation_reason: reason ?? null,
          }).eq('id', sub.id);
          await logEvent(a, {
            company_id: prof.company_id, subscription_id: sub.id,
            event_type: 'cancel_scheduled', description: reason ?? null,
            created_by_user_id: actorId,
          });
        } else {
          await a.from('subscriptions').update({
            status: 'canceled', canceled_at: new Date().toISOString(),
            cancellation_reason: reason ?? null, cancel_at_period_end: false,
          }).eq('id', sub.id);
          await a.from('companies').update({ status: 'cancelada' }).eq('id', prof.company_id);
          await logEvent(a, {
            company_id: prof.company_id, subscription_id: sub.id,
            event_type: 'subscription_canceled', new_status: 'canceled',
            description: reason ?? null, created_by_user_id: actorId,
          });
        }
        await audit(a, actorId, 'cancel_subscription', {
          company_id: prof.company_id, entity_type: 'subscription', entity_id: sub.id,
          reason, cancel_at_period_end, actor_role: 'admin',
        });
        return json({ ok: true });
      }

      // ---------------- AUTH: reactivate subscription (clears cancel_at_period_end)
      case 'reactivate_subscription': {
        if (!actorId) return json({ error: 'Unauthorized' }, 401);
        const { data: prof } = await a.from('profiles').select('company_id').eq('id', actorId).maybeSingle();
        if (!prof?.company_id) return json({ error: 'Sem empresa.' }, 403);
        const { data: isAdmin } = await a.rpc('has_role', { _user_id: actorId, _role: 'admin' });
        if (!isAdmin) return json({ error: 'Apenas admin pode reativar.' }, 403);
        const { data: sub } = await a.from('subscriptions').select('*')
          .eq('company_id', prof.company_id)
          .order('created_at', { ascending: false }).maybeSingle();
        if (!sub) return json({ error: 'Assinatura não encontrada.' }, 404);
        await a.from('subscriptions').update({
          cancel_at_period_end: false, canceled_at: null,
          status: sub.status === 'canceled' ? 'active' : sub.status,
        }).eq('id', sub.id);
        await a.from('companies').update({ status: 'ativo' }).eq('id', prof.company_id);
        await logEvent(a, {
          company_id: prof.company_id, subscription_id: sub.id,
          event_type: 'subscription_reactivated', new_status: 'active',
          created_by_user_id: actorId,
        });
        await audit(a, actorId, 'reactivate_subscription', {
          company_id: prof.company_id, entity_type: 'subscription', entity_id: sub.id, actor_role: 'admin',
        });
        return json({ ok: true });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error('billing error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
