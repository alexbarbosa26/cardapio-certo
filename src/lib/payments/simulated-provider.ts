import { supabase } from '@/integrations/supabase/client';
import type {
  CheckoutSession,
  PaymentOutcome,
  PaymentProvider,
  SignupAndCheckoutInput,
} from './types';

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('billing', { body: { action, payload } });
  if (error) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && String((data as { error: unknown }).error)) ||
      error.message || 'Erro ao chamar billing.';
    throw new Error(msg);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as T;
}

export const simulatedProvider: PaymentProvider = {
  slug: 'simulated',
  isMock: true,
  async signupAndCheckout(input: SignupAndCheckoutInput) {
    return call<{ checkout_session_id: string }>('signup_and_checkout', input);
  },
  async getCheckoutSession(session_id) {
    const r = await call<{ session: CheckoutSession }>('get_session', { session_id });
    return r.session;
  },
  async simulatePayment(session_id, outcome: PaymentOutcome) {
    await call('simulate_payment', { session_id, outcome });
  },
  async changePlan(new_plan_id) {
    await call('change_plan', { new_plan_id });
  },
  async cancelSubscription(input) {
    await call('cancel_subscription', input);
  },
  async reactivateSubscription() {
    await call('reactivate_subscription', {});
  },
};
