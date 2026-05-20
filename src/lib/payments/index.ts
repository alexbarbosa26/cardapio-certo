import type { PaymentProvider } from './types';
import { simulatedProvider } from './simulated-provider';

/**
 * Returns the active payment provider. Today only the simulated provider is
 * wired in; later we can resolve from settings / payment_providers row.
 */
export function getPaymentProvider(slug = 'simulated'): PaymentProvider {
  switch (slug) {
    case 'simulated':
    default:
      return simulatedProvider;
  }
}

export const billing = simulatedProvider;
export type { PaymentProvider, BillingCycle, CheckoutSession, PaymentOutcome, SignupAndCheckoutInput } from './types';
