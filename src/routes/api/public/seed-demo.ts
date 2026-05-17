// Server route público para criar dados de demonstração.
// PROTEGIDO: requer header `x-seed-secret` igual a process.env.SEED_DEMO_SECRET.
// Não retorna senhas em texto plano.
import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const DEMO_COMPANY = 'Restaurante Demonstração';

async function ensureUser(email: string, password: string, name: string) {
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await supabaseAdmin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    return existing.id;
  }
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name },
  });
  if (error) throw error;
  return data.user!.id;
}

export const Route = createFileRoute('/api/public/seed-demo')({
  server: {
    handlers: {
      GET: async ({ request }) => handleSeed(request),
      POST: async ({ request }) => handleSeed(request),
    },
  },
});

async function handleSeed(request: Request) {
  const secret = process.env.SEED_DEMO_SECRET;
  const provided = request.headers.get('x-seed-secret');
  if (!secret || !provided || provided !== secret) {
    return new Response(JSON.stringify({ ok: false, error: 'Não autorizado.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const { data: existingCompany } = await supabaseAdmin
      .from('companies').select('id').eq('name', DEMO_COMPANY).maybeSingle();
    let companyId = existingCompany?.id as string | undefined;
    if (!companyId) {
      const { data, error } = await supabaseAdmin.from('companies').insert({
        name: DEMO_COMPANY, trade_name: 'MesaChef Demo',
      }).select('id').single();
      if (error) throw error;
      companyId = data.id;
    }

    await supabaseAdmin.from('settings').upsert({
      company_id: companyId,
      service_fee_percentage: 10, debit_fee_percentage: 1.37, credit_fee_percentage: 3.17,
      kitchen_warning_minutes: 10, kitchen_danger_minutes: 20,
    }, { onConflict: 'company_id' });

    // Senhas aleatórias por execução — não retornadas
    const rand = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase();
    const adminId = await ensureUser('admin@gmail.com', rand(), 'Administrador Demo');
    const staffId = await ensureUser('staff@gmail.com', rand(), 'Atendente Demo');

    await supabaseAdmin.from('profiles').upsert([
      { id: adminId, company_id: companyId, name: 'Administrador Demo', email: 'admin@gmail.com' },
      { id: staffId, company_id: companyId, name: 'Atendente Demo', email: 'staff@gmail.com' },
    ], { onConflict: 'id' });

    await supabaseAdmin.from('user_roles').upsert([
      { user_id: adminId, role: 'admin' },
      { user_id: staffId, role: 'staff' },
    ], { onConflict: 'user_id,role' });

    const categories = ['Espetinhos', 'Bebidas', 'Acompanhamentos', 'Sobremesas'];
    const catIds: Record<string, string> = {};
    for (const [i, name] of categories.entries()) {
      const { data: existing } = await supabaseAdmin.from('categories')
        .select('id').eq('company_id', companyId).eq('name', name).maybeSingle();
      if (existing) { catIds[name] = existing.id; continue; }
      const { data } = await supabaseAdmin.from('categories')
        .insert({ company_id: companyId, name, sort_order: i }).select('id').single();
      catIds[name] = data!.id;
    }

    const produtos = [
      { name: 'Espetinho de Carne', price: 12, cat: 'Espetinhos', kitchen: true },
      { name: 'Espetinho de Frango', price: 10, cat: 'Espetinhos', kitchen: true },
      { name: 'Refrigerante Lata', price: 6, cat: 'Bebidas', kitchen: false },
      { name: 'Água', price: 4, cat: 'Bebidas', kitchen: false },
      { name: 'Porção de Farofa', price: 3, cat: 'Acompanhamentos', kitchen: true },
    ];
    for (const p of produtos) {
      const { data: existing } = await supabaseAdmin.from('products')
        .select('id').eq('company_id', companyId).eq('name', p.name).maybeSingle();
      if (!existing) {
        await supabaseAdmin.from('products').insert({
          company_id: companyId, category_id: catIds[p.cat],
          name: p.name, price: p.price, sends_to_kitchen: p.kitchen,
        });
      }
    }

    for (let i = 1; i <= 10; i++) {
      const name = `Mesa ${String(i).padStart(2, '0')}`;
      const { data: existing } = await supabaseAdmin.from('tables')
        .select('id').eq('company_id', companyId).eq('number', i).maybeSingle();
      if (!existing) {
        await supabaseAdmin.from('tables').insert({ company_id: companyId, name, number: i });
      }
    }

    return Response.json({ ok: true, message: 'Dados de demonstração prontos.' });
  } catch (e: any) {
    console.error('seed error', e);
    return new Response(JSON.stringify({ ok: false, error: 'Falha ao criar demo.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
