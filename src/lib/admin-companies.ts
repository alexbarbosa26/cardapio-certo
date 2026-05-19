import { supabase } from '@/integrations/supabase/client';

async function invoke<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-companies', {
    body: { action, payload },
  });
  if (error) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && String((data as { error: unknown }).error)) ||
      error.message || 'Erro ao chamar admin-companies.';
    throw new Error(msg);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export type CreateCompanyInput = {
  name: string;
  trade_name?: string;
  responsible_name?: string;
  responsible_email?: string;
  responsible_phone?: string;
  city?: string;
  state?: string;
  plan_id?: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
};

export const adminCreateCompany = (i: CreateCompanyInput) =>
  invoke<{ company_id: string; admin_user_id: string }>('create_company', i);

export const adminUpdateCompany = (i: { company_id: string } & Record<string, unknown>) =>
  invoke<{ ok: true }>('update_company', i);

export const adminSetSubscription = (i: {
  company_id: string; plan_id?: string;
  status?: 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'expired';
  current_period_end?: string; trial_ends_at?: string; billing_cycle?: 'monthly' | 'annual';
}) => invoke<{ ok: true }>('set_subscription', i);

export const adminSuspendCompany = (company_id: string) =>
  invoke<{ ok: true }>('suspend_company', { company_id });

export const adminReactivateCompany = (company_id: string) =>
  invoke<{ ok: true }>('reactivate_company', { company_id });

export const adminPromoteSuperAdmin = (i: { email: string; password: string; name: string }) =>
  invoke<{ ok: true; user_id: string }>('promote_super_admin', i);
