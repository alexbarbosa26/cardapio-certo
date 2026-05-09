// Server functions para gestão completa de usuários (apenas admin).
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

async function ensureAdmin(supabase: any, userId: string) {
  const { data: prof } = await supabase
    .from('profiles').select('company_id').eq('id', userId).maybeSingle();
  if (!prof) throw new Error('Perfil não encontrado.');
  const { data: role } = await supabase
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (!role) throw new Error('Apenas administradores podem realizar esta ação.');
  return prof.company_id as string;
}

export const createUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['admin', 'staff']),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const companyId = await ensureAdmin(context.supabase, context.userId);

    // Cria no Auth
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    await supabaseAdmin.from('profiles').upsert({
      id: uid, company_id: companyId, name: data.name, email: data.email, status: 'ativo',
    }, { onConflict: 'id' });
    await supabaseAdmin.from('user_roles').upsert({
      user_id: uid, role: data.role,
    }, { onConflict: 'user_id,role' });

    return { id: uid };
  });

export const updateUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    user_id: z.string().uuid(),
    name: z.string().min(2),
    role: z.enum(['admin', 'staff']),
    status: z.enum(['ativo', 'inativo']),
    password: z.string().min(6).optional().or(z.literal('')),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const companyId = await ensureAdmin(context.supabase, context.userId);

    // segurança: só pode editar usuário da mesma empresa
    const { data: prof } = await supabaseAdmin
      .from('profiles').select('id, company_id').eq('id', data.user_id).maybeSingle();
    if (!prof || prof.company_id !== companyId) throw new Error('Usuário inválido.');

    await supabaseAdmin.from('profiles').update({
      name: data.name, status: data.status,
    }).eq('id', data.user_id);

    // role: apaga e recria
    await supabaseAdmin.from('user_roles').delete().eq('user_id', data.user_id);
    await supabaseAdmin.from('user_roles').insert({ user_id: data.user_id, role: data.role });

    if (data.password && data.password.length >= 6) {
      await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    }
    return { ok: true };
  });
