import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CreateAlternativeChargeInput,
  CreateTokenizedChargeInput,
  OmiseAlternativePaymentMethod,
  PaymentProvider,
  TokenizedChargeResult,
  VerifiedPaymentEvent
} from "./provider";

const API_URL = "https://api.omise.co";
const TIMESTAMP_TOLERANCE_SECONDS = 10 * 60;

type OmiseCharge = {
  object?: string;
  id?: string;
  livemode?: boolean;
  amount?: number;
  currency?: string;
  status?: string;
  paid?: boolean;
  paid_at?: string | null;
  authorize_uri?: string | null;
  source?: {
    type?: string | null;
    scannable_code?: {
      image?: { download_uri?: string | null } | null;
    } | null;
  } | null;
};

function readPaidAt(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function safeAuthorizationUrl(value?: string | null) {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || !(url.hostname === "omise.co" || url.hostname.endsWith(".omise.co"))) {
    throw new Error("Omise returned an invalid authorization URL");
  }
  return url.toString();
}

function safeQrImageUrl(value?: string | null) {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "api.omise.co") {
    throw new Error("Omise returned an invalid QR image URL");
  }
  return url.toString();
}

function normalizedPaymentMethod(sourceType?: string | null): OmiseAlternativePaymentMethod | undefined {
  if (sourceType === "promptpay") return "promptpay";
  if (sourceType === "truemoney_jumpapp" || sourceType === "truemoney_qr" || sourceType === "truemoney") {
    return "truemoney_wallet";
  }
  return undefined;
}

function normalizedStatus(charge: OmiseCharge): TokenizedChargeResult["status"] {
  if (charge.paid === true || charge.status === "successful") return "paid";
  if (charge.status === "failed" || charge.status === "expired" || charge.status === "reversed") return "failed";
  return "pending";
}

export class OmiseProvider implements PaymentProvider {
  readonly id = "omise";
  readonly clientConfig;

  private readonly webhookSecrets: Buffer[];
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly secretKey: string,
    publicKey: string,
    webhookSecret: string,
    fetcher: typeof fetch = fetch
  ) {
    if (!secretKey.startsWith("skey_test_") || !publicKey.startsWith("pkey_test_")) {
      throw new Error("Omise test API keys are required");
    }
    const encodedSecrets = webhookSecret.split(",").map((value) => value.trim()).filter(Boolean);
    if (!encodedSecrets.length || encodedSecrets.some((value) => !/^[A-Za-z0-9+/]+={0,2}$/.test(value))) {
      throw new Error("Omise webhook secret is missing or invalid");
    }
    this.webhookSecrets = encodedSecrets.map((value) => Buffer.from(value, "base64"));
    if (this.webhookSecrets.some((secret) => secret.length < 16)) {
      throw new Error("Omise webhook secret is missing or invalid");
    }
    this.fetcher = fetcher;
    this.clientConfig = {
      provider: this.id,
      mode: "test" as const,
      publicKey,
      supportsAutoRenew: false
    };
  }

  async createTokenizedCharge(input: CreateTokenizedChargeInput): Promise<TokenizedChargeResult> {
    if (!/^tokn_test_[a-z0-9]+$/.test(input.token)) {
      throw new Error("Omise test token is required");
    }

    const body = new URLSearchParams({
      amount: String(input.amount),
      currency: input.currency.toLowerCase(),
      card: input.token,
      ref_id: input.idempotencyKey,
      description: "Website rental " + input.paymentId
    });
    if (input.returnUrl) body.set("return_uri", input.returnUrl);

    const charge = await this.request("/charges", { method: "POST", body });
    return this.normalizeCharge(charge, input.amount, input.currency);
  }

  async createAlternativeCharge(input: CreateAlternativeChargeInput): Promise<TokenizedChargeResult> {
    const sourceType = input.paymentMethod === "promptpay" ? "promptpay" : "truemoney_jumpapp";
    const body = new URLSearchParams({
      amount: String(input.amount),
      currency: input.currency.toLowerCase(),
      "source[type]": sourceType,
      ref_id: input.idempotencyKey,
      description: "Website rental " + input.paymentId
    });
    if (input.paymentMethod === "truemoney_wallet") body.set("return_uri", input.returnUrl);
    const charge = await this.request("/charges", { method: "POST", body });
    return this.normalizeCharge(charge, input.amount, input.currency, input.paymentMethod);
  }

  async getChargeStatus(input: {
    providerReference: string;
    amount: number;
    currency: string;
  }): Promise<TokenizedChargeResult> {
    if (!/^chrg_test_[a-z0-9]+$/.test(input.providerReference)) {
      throw new Error("Omise test charge reference is invalid");
    }
    const charge = await this.request("/charges/" + encodeURIComponent(input.providerReference), { method: "GET" });
    return this.normalizeCharge(charge, input.amount, input.currency);
  }

  async verifyWebhook(request: Request): Promise<VerifiedPaymentEvent | null> {
    const signatureHeader = request.headers.get("Omise-Signature");
    const timestamp = request.headers.get("Omise-Signature-Timestamp");
    if (!signatureHeader || !timestamp || !/^\d+$/.test(timestamp)) throw new Error("Invalid Omise webhook signature");

    const timestampSeconds = Number(timestamp);
    if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS) {
      throw new Error("Omise webhook timestamp is outside the accepted window");
    }

    const rawBody = await request.text();
    const signedPayload = timestamp + "." + rawBody;
    const suppliedSignatures = signatureHeader.split(",").map((signature) => signature.trim().toLowerCase());
    const valid = this.webhookSecrets.some((secret) => {
      const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest();
      return suppliedSignatures.some((signature) => {
        if (!/^[a-f0-9]{64}$/.test(signature)) return false;
        const received = Buffer.from(signature, "hex");
        return received.length === expected.length && timingSafeEqual(received, expected);
      });
    });
    if (!valid) throw new Error("Invalid Omise webhook signature");

    const event = JSON.parse(rawBody) as { key?: string; data?: OmiseCharge };
    const charge = event.data;
    if (!charge || charge.object !== "charge") return null;
    if (charge.livemode !== false || !/^chrg_test_[a-z0-9]+$/.test(charge.id ?? "")) {
      throw new Error("Omise test-mode charge is required");
    }

    const status = normalizedStatus(charge);
    if (status === "pending") return null;
    if (!Number.isSafeInteger(charge.amount) || !charge.currency) {
      throw new Error("Omise charge event is incomplete");
    }

    return {
      provider: this.id,
      providerReference: charge.id!,
      status,
      amount: charge.amount!,
      currency: charge.currency.toUpperCase(),
      paidAt: status === "paid" ? readPaidAt(charge.paid_at) : undefined
    };
  }

  private normalizeCharge(
    charge: OmiseCharge,
    expectedAmount: number,
    expectedCurrency: string,
    paymentMethod?: OmiseAlternativePaymentMethod
  ): TokenizedChargeResult {
    if (
      charge.object !== "charge" ||
      charge.livemode !== false ||
      !/^chrg_test_[a-z0-9]+$/.test(charge.id ?? "") ||
      !Number.isSafeInteger(charge.amount) ||
      charge.amount !== expectedAmount ||
      charge.currency?.toUpperCase() !== expectedCurrency.toUpperCase()
    ) {
      throw new Error("Omise charge response did not match the pending payment");
    }

    const status = normalizedStatus(charge);
    return {
      providerReference: charge.id!,
      status,
      amount: charge.amount!,
      currency: charge.currency!.toUpperCase(),
      paidAt: status === "paid" ? readPaidAt(charge.paid_at) : undefined,
      authorizationUrl: status === "pending" ? safeAuthorizationUrl(charge.authorize_uri) : undefined,
      qrImageUrl: status === "pending" ? safeQrImageUrl(charge.source?.scannable_code?.image?.download_uri) : undefined,
      paymentMethod: paymentMethod ?? normalizedPaymentMethod(charge.source?.type)
    };
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: URLSearchParams }): Promise<OmiseCharge> {
    const response = await this.fetcher(API_URL + path, {
      method: init.method,
      headers: {
        authorization: "Basic " + Buffer.from(this.secretKey + ":").toString("base64"),
        ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {})
      },
      body: init.body
    });
    const data = await response.json().catch(() => null) as OmiseCharge | null;
    if (!response.ok || !data) throw new Error("Omise API request failed with status " + response.status);
    return data;
  }
}