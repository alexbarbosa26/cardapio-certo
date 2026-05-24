// Bootstrap one-time: cria o super admin se nenhum existir ainda.
// Requer header `Authorization: Bearer <BOOTSTRAP_SECRET>` para impedir
// que qualquer pessoa na internet possa disparar a criação.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const BOOTSTRAP_SECRET = Deno.env.get('BOOTSTRAP_SECRET');
  const BOOTSTRAP_EMAIL = Deno.env.get('BOOTSTRAP_EMAIL');
  const BOOTSTRAP_PASSWORD = Deno.env.get('BOOTSTRAP_PASSWORD');
  const BOOTSTRAP_NAME = Deno.env.get('BOOTSTRAP_NAME') ?? 'Super Admin';

  if (!BOOTSTRAP_SECRET || !BOOTSTRAP_EMAIL || !BOOTSTRAP_PASSWORD) {
    return json({ error: 'Bootstrap não configurado.' }, 503);
  }

  const auth = req.headers.get('Authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Constant-time-ish comparison
  if (provided.length !== BOOTSTRAP_SECRET.length || provided !== BOOTSTRAP_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: existing } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
  if (existing && existing.length > 0) {
    return json({ ok: false, error: 'Super admin já existe.' }, 409);
  }

  let userId: string | null = null;
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list.users.find((u) => u.email?.toLowerCase() === BOOTSTRAP_EMAIL.toLowerCase());
  if (found) {
    userId = found.id;
    await admin.auth.admin.updateUserById(userId, { password: BOOTSTRAP_PASSWORD });
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD, email_confirm: true,
      user_metadata: { name: BOOTSTRAP_NAME },
    });
    if (error || !created.user) return json({ error: error?.message ?? 'falha' }, 400);
    userId = created.user.id;
  }

  await admin.from('profiles').upsert({
    id: userId, company_id: null, name: BOOTSTRAP_NAME, email: BOOTSTRAP_EMAIL, status: 'ativo',
  });
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });

  return json({ ok: true });
});
