import { supabase } from '@/integrations/supabase/client';

async function invoke<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-plans', {
    body: { action, payload },
  });
  if (error) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && String((data as { error: unknown }).error)) ||
      error.message || 'Erro ao chamar admin-plans.';
    throw new Error(msg);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export type PlanInput = {
  name: string;
  slug?: string | null;
  short_description?: string | null;
  full_description?: string | null;
  description?: string | null;
  monthly_price?: number;
  annual_price?: number;
  trial_days?: number;
  max_users?: number | null;
  max_tables?: number | null;
  max_open_tabs?: number | null;
  max_products?: number | null;
  allow_tables_module?: boolean;
  allow_tabs_module?: boolean;
  allow_kitchen_module?: boolean;
  allow_cash_register_module?: boolean;
  allow_advanced_dashboard?: boolean;
  allow_reports?: boolean;
  allow_visual_customization?: boolean;
  support_level?: string;
  is_featured?: boolean;
  show_on_landing_page?: boolean;
  display_order?: number;
  status?: 'ativo' | 'inativo';
};

export const adminCreatePlan = (i: PlanInput) =>
  invoke<{ plan: PlanInput & { id: string } }>('create_plan', i as Record<string, unknown>);

export const adminUpdatePlan = (plan_id: string, i: Partial<PlanInput>) =>
  invoke<{ plan: PlanInput & { id: string } }>('update_plan', { plan_id, ...i });

export const adminSetPlanStatus = (plan_id: string, status: 'ativo' | 'inativo') =>
  invoke<{ ok: true }>('set_plan_status', { plan_id, status });

export const adminDeletePlan = (plan_id: string) =>
  invoke<{ ok: true }>('delete_plan', { plan_id });
