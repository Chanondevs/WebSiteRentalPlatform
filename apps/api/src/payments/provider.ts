export type VerifiedPaymentEvent = {
  provider: string;
  providerReference: string;
  status: "paid" | "failed";
  amount: number;
  currency: string;
  paidAt?: Date;
  providerSubscriptionReference?: string;
};

export type CreateCheckoutInput = {
  paymentId: string;
  amount: number;
  currency: string;
  termMonths: number;
  autoRenew: boolean;
  idempotencyKey: string;
  returnUrl?: string;
  cancelUrl?: string;
};

export type CheckoutSession = {
  providerReference: string;
  checkoutUrl: string;
  providerSubscriptionReference?: string;
  expiresAt?: Date;
};

export type PaymentClientConfig = {
  provider: string;
  mode: "test";
  publicKey?: string;
  supportsAutoRenew: boolean;
};

export type CreateTokenizedChargeInput = {
  paymentId: string;
  amount: number;
  currency: string;
  token: string;
  idempotencyKey: string;
  returnUrl?: string;
};

export type OmiseAlternativePaymentMethod = "promptpay" | "truemoney_wallet";

export type CreateAlternativeChargeInput = {
  paymentId: string;
  amount: number;
  currency: string;
  paymentMethod: OmiseAlternativePaymentMethod;
  idempotencyKey: string;
  returnUrl: string;
};

export type TokenizedChargeResult = {
  providerReference: string;
  status: "pending" | "paid" | "failed";
  amount: number;
  currency: string;
  paidAt?: Date;
  authorizationUrl?: string;
  qrImageUrl?: string;
  paymentMethod?: OmiseAlternativePaymentMethod;
};

export interface PaymentProvider {
  /** Stable lowercase identifier stored with each payment, e.g. a provider slug. */
  id: string;
  /** Optional hosted checkout for providers that return a hosted URL. */
  createCheckout?(input: CreateCheckoutInput): Promise<CheckoutSession>;
  /** Optional browser-tokenized charge flow; raw card details must never reach this API. */
  createTokenizedCharge?(input: CreateTokenizedChargeInput): Promise<TokenizedChargeResult>;
  /** Optional server-created QR or redirect payment charge. */
  createAlternativeCharge?(input: CreateAlternativeChargeInput): Promise<TokenizedChargeResult>;
  /** Optional server-to-server status refresh for a previously created charge. */
  getChargeStatus?(input: {
    providerReference: string;
    amount: number;
    currency: string;
  }): Promise<TokenizedChargeResult>;
  /** Public-only configuration safe to return to an authenticated client. */
  clientConfig?: PaymentClientConfig;
  /**
   * Verify the provider signature against the original request body before
   * returning normalized event fields. Return null for unrelated or non-final events.
   */
  verifyWebhook(request: Request): Promise<VerifiedPaymentEvent | null>;
}

const providers = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider) {
  if (!/^[a-z0-9][a-z0-9_-]{1,59}$/.test(provider.id)) {
    throw new Error("Payment provider id must be a stable lowercase slug");
  }
  if (providers.has(provider.id)) {
    throw new Error("Payment provider already registered");
  }
  providers.set(provider.id, provider);
}

export function getPaymentProvider(id: string | undefined) {
  if (!id) return null;
  return providers.get(id) ?? null;
}

export function getConfiguredPaymentProvider() {
  return getPaymentProvider(Bun.env.PAYMENT_PROVIDER);
}