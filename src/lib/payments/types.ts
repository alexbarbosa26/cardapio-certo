/**
 * Payment provider contract. The current MesaChef MVP only ships a simulated
 * provider, but the abstraction lets us plug a real gateway (Mercado Pago,
 * InfinitePay, etc.) later without touching the business rules.
 */
export type BillingCycle = 'monthly' | 'annual';
export type PaymentOutcome = 'approve' | 'pending' | 'reject';

export interface CheckoutSession {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  billing_cycle: BillingCycle;
  amount: number;
  plan_id: string;
  company_id: string;
  subscription_id: string;
  plans?: { name: string; slug: string } | null;
  companies?: { name: string } | null;
}

export interface SignupAndCheckoutInput {
  plan_slug: string;
  billing_cycle: BillingCycle;
  company_name: string;
  trade_name?: string;
  document?: string;
  responsible_name: string;
  responsible_phone?: string;
  city?: string;
  state?: string;
  admin_email: string;
  admin_password: string;
}

export interface PaymentProvider {
  slug: string;
  isMock: boolean;
  signupAndCheckout(input: SignupAndCheckoutInput): Promise<{ checkout_session_id: string }>;
  getCheckoutSession(sessionId: string): Promise<CheckoutSession>;
  simulatePayment(sessionId: string, outcome: PaymentOutcome): Promise<void>;
  changePlan(newPlanId: string): Promise<void>;
  cancelSubscription(input: { reason?: string; cancel_at_period_end?: boolean }): Promise<void>;
  reactivateSubscription(): Promise<void>;
}
