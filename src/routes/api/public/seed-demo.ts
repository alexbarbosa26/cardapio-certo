// Server route público para criar dados de demonstração.
// Idempotente: se já existir, apenas garante senhas/dados básicos.
import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const DEMO_COMPANY = 'Restaurante Demonstração';

async function ensureUser(email: string, password: string, name: string) {
  // tenta achar
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
      GET: async () => handleSeed(),
      POST: async () => handleSeed(),
    },
  },
});

async function handleSeed() {
  try {
    // 1. Empresa
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

    // 2. Settings
    await supabaseAdmin.from('settings').upsert({
      company_id: companyId,
      service_fee_percentage: 10, debit_fee_percentage: 1.37, credit_fee_percentage: 3.17,
      kitchen_warning_minutes: 10, kitchen_danger_minutes: 20,
    }, { onConflict: 'company_id' });

    // 3. Usuários
    const adminId = await ensureUser('admin@gmail.com', 'admin123', 'Administrador Demo');
    const staffId = await ensureUser('staff@gmail.com', 'staff123', 'Atendente Demo');

    // 4. Profiles
    await supabaseAdmin.from('profiles').upsert([
      { id: adminId, company_id: companyId, name: 'Administrador Demo', email: 'admin@gmail.com' },
      { id: staffId, company_id: companyId, name: 'Atendente Demo', email: 'staff@gmail.com' },
    ], { onConflict: 'id' });

    // 5. Roles
    await supabaseAdmin.from('user_roles').upsert([
      { user_id: adminId, role: 'admin' },
      { user_id: staffId, role: 'staff' },
    ], { onConflict: 'user_id,role' });

    // 6. Categorias
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

    // 7. Produtos
    const produtos = [
      { name: 'Espetinho de Carne', price: 12, cat: 'Espetinhos', kitchen: true, withOptions: true },
      { name: 'Espetinho de Frango', price: 10, cat: 'Espetinhos', kitchen: true, withOptions: true },
      { name: 'Refrigerante Lata', price: 6, cat: 'Bebidas', kitchen: false },
      { name: 'Água', price: 4, cat: 'Bebidas', kitchen: false },
      { name: 'Porção de Farofa', price: 3, cat: 'Acompanhamentos', kitchen: true },
    ];
    for (const p of produtos) {
      const { data: existing } = await supabaseAdmin.from('products')
        .select('id').eq('company_id', companyId).eq('name', p.name).maybeSingle();
      let prodId = existing?.id as string | undefined;
      if (!prodId) {
        const { data } = await supabaseAdmin.from('products').insert({
          company_id: companyId, category_id: catIds[p.cat],
          name: p.name, price: p.price, sends_to_kitchen: p.kitchen,
        }).select('id').single();
        prodId = data!.id;
      }
      if (p.withOptions && prodId) {
        // grupo Acompanhamento
        const { data: grpExist } = await supabaseAdmin.from('option_groups')
          .select('id').eq('product_id', prodId).eq('name', 'Acompanhamentos').maybeSingle();
        let acompId = grpExist?.id as string | undefined;
        if (!acompId) {
          const { data } = await supabaseAdmin.from('option_groups').insert({
            company_id: companyId, product_id: prodId, name: 'Acompanhamentos',
            required: false, selection_type: 'multipla', max_options: 4, sort_order: 1,
          }).select('id').single();
          acompId = data!.id;
          for (const [i, item] of ['Farofa', 'Vinagrete', 'Arroz', 'Salada'].entries()) {
            await supabaseAdmin.from('option_items').insert({
              option_group_id: acompId, name: item, sort_order: i,
            });
          }
        }
        // grupo Molho
        const { data: molExist } = await supabaseAdmin.from('option_groups')
          .select('id').eq('product_id', prodId).eq('name', 'Molho').maybeSingle();
        if (!molExist) {
          const { data } = await supabaseAdmin.from('option_groups').insert({
            company_id: companyId, product_id: prodId, name: 'Molho',
            required: false, selection_type: 'unica', max_options: 1, sort_order: 2,
          }).select('id').single();
          for (const [i, item] of ['Molho da Casa', 'Molho Apimentado', 'Barbecue', 'Sem Molho'].entries()) {
            await supabaseAdmin.from('option_items').insert({
              option_group_id: data!.id, name: item, sort_order: i,
            });
          }
        }
      }
    }

    // 8. Mesas
    for (let i = 1; i <= 10; i++) {
      const name = `Mesa ${String(i).padStart(2, '0')}`;
      const { data: existing } = await supabaseAdmin.from('tables')
        .select('id').eq('company_id', companyId).eq('number', i).maybeSingle();
      if (!existing) {
        await supabaseAdmin.from('tables').insert({ company_id: companyId, name, number: i });
      }
    }

    return Response.json({
      ok: true,
      message: 'Dados de demonstração criados.',
      credentials: {
        admin: { email: 'admin@gmail.com', password: 'admin123' },
        staff: { email: 'staff@gmail.com', password: 'staff123' },
      },
    });
  } catch (e: any) {
    console.error('seed error', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
