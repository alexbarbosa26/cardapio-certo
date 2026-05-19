// Bootstrap one-time: cria o super admin de demonstração se NENHUM existir ainda.
// Sem necessidade de autenticação por ser idempotente e auto-limitada.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const DEFAULT_EMAIL = 'superadmin@mesachef.com.br';
const DEFAULT_PASSWORD = 'superadmin';
const DEFAULT_NAME = 'Super Admin Demo';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Bloqueia se já existir qualquer super admin.
  const { data: existing } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Super admin já existe; use o login.' }), {
      status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Cria ou recupera usuário de auth.
  let userId: string | null = null;
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list.users.find((u) => u.email?.toLowerCase() === DEFAULT_EMAIL);
  if (found) {
    userId = found.id;
    await admin.auth.admin.updateUserById(userId, { password: DEFAULT_PASSWORD });
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, email_confirm: true,
      user_metadata: { name: DEFAULT_NAME },
    });
    if (error || !created.user) {
      return new Response(JSON.stringify({ error: error?.message ?? 'falha' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    userId = created.user.id;
  }

  await admin.from('profiles').upsert({
    id: userId, company_id: null, name: DEFAULT_NAME, email: DEFAULT_EMAIL, status: 'ativo',
  });
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });

  return new Response(JSON.stringify({
    ok: true, email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD,
    note: 'Faça login e troque a senha em produção.',
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
