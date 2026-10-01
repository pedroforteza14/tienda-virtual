import { env } from '@/config/env';
import { mercadoPagoProvider } from '@/server/payments/mercadopago-provider';
import { mockProvider } from '@/server/payments/mock-provider';
import { stripeProvider } from '@/server/payments/stripe-provider';
import type { PaymentProvider } from '@/server/payments/provider';

/** Adapter selection. One switch, driven by configuration. */
export function paymentProvider(): PaymentProvider {
  switch (env().PAYMENT_PROVIDER) {
    case 'mercadopago':
      return mercadoPagoProvider;
    case 'stripe':
      return stripeProvider;
    case 'mock':
    default:
      return mockProvider;
  }
}

export type { PaymentProvider } from '@/server/payments/provider';
