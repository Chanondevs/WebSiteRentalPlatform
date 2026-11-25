import { Elysia, t } from "elysia";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { db, payments, sessions, subscriptions, templates, users, websites } from "@website-rental/database";
import {
  getConfiguredPaymentProvider,
  getPaymentProvider,
  registerPaymentProvider,
  type CheckoutSession,
  type TokenizedChargeResult,
  type VerifiedPaymentEvent
} from "./payments/provider";
import { OmiseProvider } from "./payments/omise";
import { settleVerifiedPayment } from "./payments/settle";

const port = Number(Bun.env.API_PORT ?? 3001);
const SESSION_DAYS = 7;
const mediaDirectory = resolve(import.meta.dir, "../uploads");

if (Bun.env.PAYMENT_PROVIDER === "omise") {
  try {
    if (Bun.env.PAYMENT_MODE !== "test") throw new Error("Omise test mode is required");
    registerPaymentProvider(new OmiseProvider(
      Bun.env.OMISE_SECRET_KEY ?? "",
      Bun.env.OMISE_PUBLIC_KEY ?? "",
      Bun.env.OMISE_WEBHOOK_SECRET ?? ""
    ));
  } catch {
    console.warn("Omise test checkout is disabled until test keys and webhook secret are configured.");
  }
}

function getPaymentReturnUrl(websiteId: string, paymentId: string) {
  const base = Bun.env.PAYMENT_RETURN_URL ?? (Bun.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!base) throw new Error("PAYMENT_RETURN_URL is required in production");
  const baseUrl = new URL(base);
  if (baseUrl.protocol !== "https:" && !(Bun.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(baseUrl.hostname))) {
    throw new Error("Payment return URL must use HTTPS");
  }
  const url = new URL("/dashboard/sites/" + encodeURIComponent(websiteId) + "/billing", baseUrl.origin);
  url.searchParams.set("paymentId", paymentId);
  return url.toString();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createSessionToken() {
  return randomBytes(32).toString("hex");
}

function getBearerToken(authorization?: string) {
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

async function getAuthenticatedUserId(authorization?: string) {
  const token = getBearerToken(authorization);
  if (!token) return null;
  const [session] = await db.select({ userId: sessions.userId }).from(sessions).where(and(
    eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())
  )).limit(1);
  return session?.userId ?? null;
}

const app = new Elysia()
  .get("/", () => ({
    name: "Website Rental API",
    status: "running",
    version: "0.2.0"
  }))
  .get("/health", () => ({
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString()
  }))
  .get("/health/database", async ({ set }) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ok", service: "postgresql" };
    } catch (error) {
      set.status = 503;
      return {
        status: "error",
        service: "postgresql",
        message: error instanceof Error ? error.message : "Database connection failed"
      };
    }
  })
  .post("/media", async ({ request, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    let form: FormData;
    try { form = await request.formData(); }
    catch { set.status = 400; return { error: "INVALID_UPLOAD" }; }
    const file = form.get("file");
    const extensions: Record<string, string> = {
      "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"
    };
    if (!(file instanceof File) || !extensions[file.type]) {
      set.status = 415;
      return { error: "UNSUPPORTED_IMAGE_TYPE" };
    }
    if (file.size > 5 * 1024 * 1024) {
      set.status = 413;
      return { error: "IMAGE_TOO_LARGE" };
    }
    const filename = randomBytes(16).toString("hex") + extensions[file.type];
    await mkdir(mediaDirectory, { recursive: true });
    await Bun.write(resolve(mediaDirectory, filename), file);
    set.status = 201;
    return { url: "/api/media/" + filename };
  })
  .get("/media/:filename", async ({ params, set }) => {
    if (!/^[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(params.filename)) {
      set.status = 404;
      return { error: "MEDIA_NOT_FOUND" };
    }
    const file = Bun.file(resolve(mediaDirectory, params.filename));
    if (!(await file.exists())) {
      set.status = 404;
      return { error: "MEDIA_NOT_FOUND" };
    }
    const typeByExtension: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif"
    };
    set.headers["content-type"] = typeByExtension[params.filename.split(".").at(-1) ?? ""] ?? "application/octet-stream";
    set.headers["cache-control"] = "public, max-age=31536000, immutable";
    return file;
  })
  .get("/templates", async () => db.select({
    id: templates.id, slug: templates.slug, name: templates.name,
    description: templates.description, category: templates.category,
    monthlyPrice: templates.monthlyPrice, yearlyPrice: templates.yearlyPrice
  }).from(templates).where(eq(templates.isActive, true)))
  .get("/websites", async ({ request, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    return db.select().from(websites).where(eq(websites.ownerId, ownerId));
  })
  .get("/websites/:id", async ({ request, params, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [website] = await db.select().from(websites).where(and(
      eq(websites.id, params.id), eq(websites.ownerId, ownerId)
    )).limit(1);
    if (!website) { set.status = 404; return { error: "WEBSITE_NOT_FOUND" }; }
    return { website };
  })
  .get("/public/sites/:subdomain", async ({ params, set }) => {
    const [website] = await db.select({
      name: websites.name, subdomain: websites.subdomain, content: websites.content
    }).from(websites).where(and(
      eq(websites.subdomain, params.subdomain), eq(websites.status, "ACTIVE")
    )).limit(1);
    if (!website) { set.status = 404; return { error: "SITE_NOT_PUBLISHED" }; }
    return { website };
  })
  .post("/websites/:id/publish", async ({ request, params, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [activeSubscription] = await db.select({ id: subscriptions.id }).from(subscriptions).where(and(
      eq(subscriptions.websiteId, params.id),
      eq(subscriptions.ownerId, ownerId),
      eq(subscriptions.status, "ACTIVE")
    )).limit(1);
    if (!activeSubscription) { set.status = 409; return { error: "ACTIVE_SUBSCRIPTION_REQUIRED" }; }
    const [website] = await db.update(websites).set({ status: "ACTIVE", updatedAt: new Date() })
      .where(and(eq(websites.id, params.id), eq(websites.ownerId, ownerId))).returning();
    if (!website) { set.status = 404; return { error: "WEBSITE_NOT_FOUND" }; }
    return { website };
  })
  .post("/websites", async ({ request, body, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [template] = await db.select().from(templates).where(and(
      eq(templates.slug, body.templateSlug), eq(templates.isActive, true)
    )).limit(1);
    if (!template) { set.status = 404; return { error: "TEMPLATE_NOT_FOUND" }; }
    const subdomain = body.subdomain.trim().toLowerCase();
    const [taken] = await db.select({ id: websites.id }).from(websites).where(eq(websites.subdomain, subdomain)).limit(1);
    if (taken) { set.status = 409; return { error: "SUBDOMAIN_TAKEN" }; }
    const [website] = await db.insert(websites).values({
      ownerId, templateId: template.id, name: body.name.trim(),
      subdomain, content: template.defaultContent
    }).returning();
    set.status = 201;
    return { website };
  }, {
    body: t.Object({
      templateSlug: t.String({ minLength: 1, maxLength: 80 }),
      name: t.String({ minLength: 2, maxLength: 160 }),
      subdomain: t.String({ minLength: 3, maxLength: 80, pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$" })
    })
  })
  .patch("/websites/:id", async ({ request, params, body, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [website] = await db.update(websites).set({
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.content ? { content: body.content } : {}),
      updatedAt: new Date()
    }).where(and(eq(websites.id, params.id), eq(websites.ownerId, ownerId))).returning();
    if (!website) { set.status = 404; return { error: "WEBSITE_NOT_FOUND" }; }
    return { website };
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 2, maxLength: 160 })),
      content: t.Optional(t.Record(t.String(), t.Any()))
    })
  })
  .get("/websites/:id/subscriptions", async ({ request, params, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [website] = await db.select({ id: websites.id }).from(websites).where(and(
      eq(websites.id, params.id), eq(websites.ownerId, ownerId)
    )).limit(1);
    if (!website) { set.status = 404; return { error: "WEBSITE_NOT_FOUND" }; }
    const history = await db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      termMonths: subscriptions.termMonths,
      amount: subscriptions.amount,
      currency: payments.currency,
      autoRenew: subscriptions.autoRenew,
      startsAt: subscriptions.startsAt,
      endsAt: subscriptions.endsAt,
      nextBillingAt: subscriptions.nextBillingAt,
      createdAt: subscriptions.createdAt,
      paymentId: payments.id,
      paymentStatus: payments.status
    }).from(subscriptions).leftJoin(payments, eq(payments.subscriptionId, subscriptions.id)).where(and(
      eq(subscriptions.websiteId, website.id),
      eq(subscriptions.ownerId, ownerId)
    )).orderBy(desc(subscriptions.createdAt));
    const provider = getConfiguredPaymentProvider();
    return {
      subscriptions: history,
      checkoutAvailable: Boolean(provider),
      paymentClient: provider?.clientConfig ?? null
    };
  })
  .post("/websites/:id/subscriptions", async ({ request, params, body, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [website] = await db.select().from(websites).where(and(
      eq(websites.id, params.id), eq(websites.ownerId, ownerId)
    )).limit(1);
    if (!website) { set.status = 404; return { error: "WEBSITE_NOT_FOUND" }; }
    const [template] = await db.select().from(templates).where(eq(templates.id, website.templateId)).limit(1);
    if (!template) { set.status = 404; return { error: "TEMPLATE_NOT_FOUND" }; }
    const provider = getConfiguredPaymentProvider();
    if (body.autoRenew && provider && !provider.clientConfig?.supportsAutoRenew) {
      set.status = 409;
      return { error: "AUTO_RENEW_NOT_SUPPORTED_BY_PROVIDER" };
    }
    const amount = body.termMonths === 12 ? template.yearlyPrice : template.monthlyPrice * body.termMonths;
    const result = await db.transaction(async (tx) => {
      const [subscription] = await tx.insert(subscriptions).values({
        websiteId: website.id,
        ownerId,
        termMonths: body.termMonths,
        amount,
        autoRenew: body.autoRenew ?? false
      }).returning();
      const [payment] = await tx.insert(payments).values({
        subscriptionId: subscription.id,
        provider: "unconfigured",
        amount,
        currency: "THB"
      }).returning();
      return { subscription, payment };
    });
    set.status = 201;
    return {
      subscription: result.subscription,
      paymentRequired: true,
      payment: {
        id: result.payment.id,
        status: result.payment.status,
        amount: result.payment.amount,
        currency: result.payment.currency
      },
      checkoutAvailable: Boolean(provider),
      paymentClient: provider?.clientConfig ?? null
    };
  }, {
    body: t.Object({
      termMonths: t.Integer({ minimum: 1, maximum: 12 }),
      autoRenew: t.Optional(t.Boolean())
    })
  })
  .post("/payments/:paymentId/checkout", async ({ request, params, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [record] = await db.select({
      paymentId: payments.id,
      subscriptionId: subscriptions.id,
      paymentStatus: payments.status,
      amount: payments.amount,
      currency: payments.currency,
      currentProvider: payments.provider,
      termMonths: subscriptions.termMonths,
      autoRenew: subscriptions.autoRenew
    }).from(payments).innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id)).where(and(
      eq(payments.id, params.paymentId),
      eq(subscriptions.ownerId, ownerId)
    )).limit(1);
    if (!record) { set.status = 404; return { error: "PAYMENT_NOT_FOUND" }; }
    if (record.paymentStatus !== "PENDING") { set.status = 409; return { error: "PAYMENT_NOT_PENDING" }; }
    const provider = getConfiguredPaymentProvider();
    if (!provider) {
      set.status = 503;
      return { error: "PAYMENT_PROVIDER_NOT_CONFIGURED" };
    }
    if (!provider.createCheckout) {
      set.status = 409;
      return { error: "PAYMENT_PROVIDER_REQUIRES_TOKENIZED_CARD" };
    }
    if (record.currentProvider !== "unconfigured" && record.currentProvider !== provider.id) {
      set.status = 409;
      return { error: "PAYMENT_PROVIDER_MISMATCH" };
    }

    let checkout: CheckoutSession;
    try {
      checkout = await provider.createCheckout({
        paymentId: record.paymentId,
        amount: record.amount,
        currency: record.currency,
        termMonths: record.termMonths,
        autoRenew: record.autoRenew,
        idempotencyKey: record.paymentId,
        returnUrl: Bun.env.PAYMENT_RETURN_URL,
        cancelUrl: Bun.env.PAYMENT_CANCEL_URL
      });
    } catch {
      set.status = 502;
      return { error: "PAYMENT_CHECKOUT_UNAVAILABLE" };
    }
    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(checkout.checkoutUrl);
      if (checkoutUrl.protocol !== "https:") throw new Error();
    } catch {
      set.status = 502;
      return { error: "PAYMENT_CHECKOUT_INVALID" };
    }
    if (!checkout.providerReference || checkout.providerReference.length > 160) {
      set.status = 502;
      return { error: "PAYMENT_REFERENCE_INVALID" };
    }

    try {
      const [updated] = await db.update(payments).set({
        provider: provider.id,
        providerReference: checkout.providerReference
      }).where(and(
        eq(payments.id, record.paymentId),
        eq(payments.status, "PENDING")
      )).returning({ id: payments.id });
      if (!updated) { set.status = 409; return { error: "PAYMENT_NOT_PENDING" }; }
      if (checkout.providerSubscriptionReference) {
        await db.update(subscriptions).set({
          providerSubscriptionReference: checkout.providerSubscriptionReference
        }).where(eq(subscriptions.id, record.subscriptionId));
      }
    } catch {
      set.status = 409;
      return { error: "PAYMENT_REFERENCE_CONFLICT" };
    }

    return {
      paymentId: record.paymentId,
      provider: provider.id,
      checkoutUrl: checkoutUrl.toString(),
      expiresAt: checkout.expiresAt ?? null
    };
  })
  .post("/payments/:paymentId/charge", async ({ request, params, body, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [record] = await db.select({
      paymentId: payments.id,
      paymentStatus: payments.status,
      amount: payments.amount,
      currency: payments.currency,
      currentProvider: payments.provider,
      providerReference: payments.providerReference,
      autoRenew: subscriptions.autoRenew,
      websiteId: subscriptions.websiteId
    }).from(payments).innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id)).where(and(
      eq(payments.id, params.paymentId),
      eq(subscriptions.ownerId, ownerId)
    )).limit(1);
    if (!record) { set.status = 404; return { error: "PAYMENT_NOT_FOUND" }; }
    if (record.paymentStatus !== "PENDING") { set.status = 409; return { error: "PAYMENT_NOT_PENDING" }; }
    if (record.autoRenew) { set.status = 409; return { error: "AUTO_RENEW_NOT_SUPPORTED_BY_PROVIDER" }; }
    if (record.providerReference) { set.status = 409; return { error: "PAYMENT_ALREADY_SUBMITTED" }; }
    if (Boolean(body.paymentMethod) === Boolean(body.token)) {
      set.status = 400;
      return { error: "PAYMENT_METHOD_INVALID" };
    }

    const provider = getConfiguredPaymentProvider();
    if (!provider || (body.paymentMethod ? !provider.createAlternativeCharge : !provider.createTokenizedCharge)) {
      set.status = 503;
      return { error: "PAYMENT_PROVIDER_NOT_CONFIGURED" };
    }
    if (record.currentProvider !== "unconfigured" && record.currentProvider !== provider.id) {
      set.status = 409;
      return { error: "PAYMENT_PROVIDER_MISMATCH" };
    }

    let charge: TokenizedChargeResult;
    try {
      const returnUrl = getPaymentReturnUrl(record.websiteId, record.paymentId);
      if (body.paymentMethod) {
        charge = await provider.createAlternativeCharge!({
          paymentId: record.paymentId,
          amount: record.amount,
          currency: record.currency,
          paymentMethod: body.paymentMethod,
          idempotencyKey: record.paymentId,
          returnUrl
        });
      } else {
        if (!body.token) {
          set.status = 400;
          return { error: "PAYMENT_TOKEN_REQUIRED" };
        }
        charge = await provider.createTokenizedCharge!({
          paymentId: record.paymentId,
          amount: record.amount,
          currency: record.currency,
          token: body.token,
          idempotencyKey: record.paymentId,
          returnUrl
        });
      }
    } catch {
      set.status = 502;
      return { error: "PAYMENT_CHARGE_UNAVAILABLE" };
    }
    if (!charge.providerReference || charge.providerReference.length > 160) {
      set.status = 502;
      return { error: "PAYMENT_REFERENCE_INVALID" };
    }

    try {
      const [updated] = await db.update(payments).set({
        provider: provider.id,
        providerReference: charge.providerReference
      }).where(and(
        eq(payments.id, record.paymentId),
        eq(payments.status, "PENDING"),
        eq(payments.provider, record.currentProvider)
      )).returning({ id: payments.id });
      if (!updated) { set.status = 409; return { error: "PAYMENT_ALREADY_SUBMITTED" }; }
    } catch {
      set.status = 409;
      return { error: "PAYMENT_REFERENCE_CONFLICT" };
    }

    if (charge.status !== "pending") {
      const outcome = await settleVerifiedPayment({
        provider: provider.id,
        providerReference: charge.providerReference,
        status: charge.status,
        amount: charge.amount,
        currency: charge.currency,
        paidAt: charge.paidAt
      });
      if (outcome === "amount_mismatch") { set.status = 400; return { error: "PAYMENT_AMOUNT_MISMATCH" }; }
      if (outcome === "not_found") { set.status = 404; return { error: "PAYMENT_NOT_FOUND" }; }
    }

    return {
      paymentId: record.paymentId,
      provider: provider.id,
      status: charge.status,
      authorizationUrl: charge.authorizationUrl ?? null,
      qrImageUrl: charge.qrImageUrl ?? null,
      paymentMethod: charge.paymentMethod ?? null
    };
  }, {
    body: t.Object({
      token: t.Optional(t.String({ minLength: 16, maxLength: 100, pattern: "^tokn_test_[a-z0-9]+$" })),
      paymentMethod: t.Optional(t.Union([
        t.Literal("promptpay"),
        t.Literal("truemoney_wallet")
      ]))
    })
  })
  .get("/payments/:paymentId/status", async ({ request, params, set }) => {
    const ownerId = await getAuthenticatedUserId(request.headers.get("authorization") ?? undefined);
    if (!ownerId) { set.status = 401; return { error: "UNAUTHORIZED" }; }
    const [record] = await db.select({
      paymentId: payments.id,
      status: payments.status,
      amount: payments.amount,
      currency: payments.currency,
      provider: payments.provider,
      providerReference: payments.providerReference
    }).from(payments).innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id)).where(and(
      eq(payments.id, params.paymentId),
      eq(subscriptions.ownerId, ownerId)
    )).limit(1);
    if (!record) { set.status = 404; return { error: "PAYMENT_NOT_FOUND" }; }

    let paymentDetails: Pick<TokenizedChargeResult, "authorizationUrl" | "qrImageUrl" | "paymentMethod"> = {};
    if (record.status === "PENDING" && record.providerReference) {
      const provider = getPaymentProvider(record.provider);
      if (provider?.getChargeStatus) {
        try {
          const charge = await provider.getChargeStatus({
            providerReference: record.providerReference,
            amount: record.amount,
            currency: record.currency
          });
          paymentDetails = {
            authorizationUrl: charge.authorizationUrl,
            qrImageUrl: charge.qrImageUrl,
            paymentMethod: charge.paymentMethod
          };
          if (charge.status !== "pending") {
            const outcome = await settleVerifiedPayment({
              provider: provider.id,
              providerReference: charge.providerReference,
              status: charge.status,
              amount: charge.amount,
              currency: charge.currency,
              paidAt: charge.paidAt
            });
            if (outcome === "amount_mismatch") { set.status = 400; return { error: "PAYMENT_AMOUNT_MISMATCH" }; }
          }
        } catch {
          set.status = 502;
          return { error: "PAYMENT_STATUS_UNAVAILABLE" };
        }
      }
    }

    const [updated] = await db.select({ status: payments.status }).from(payments)
      .where(eq(payments.id, record.paymentId)).limit(1);
    return {
      paymentId: record.paymentId,
      status: updated?.status ?? record.status,
      submitted: Boolean(record.providerReference),
      authorizationUrl: paymentDetails.authorizationUrl ?? null,
      qrImageUrl: paymentDetails.qrImageUrl ?? null,
      paymentMethod: paymentDetails.paymentMethod ?? null
    };
  })
  .post("/payments/webhook/:provider", async ({ request, params, set }) => {
    const provider = getPaymentProvider(params.provider.toLowerCase());
    if (!provider) {
      set.status = 503;
      return { error: "PAYMENT_PROVIDER_NOT_CONFIGURED" };
    }

    let event: VerifiedPaymentEvent | null;
    try { event = await provider.verifyWebhook(request); }
    catch {
      set.status = 400;
      return { error: "INVALID_PAYMENT_WEBHOOK" };
    }
    if (!event) return { received: true, ignored: true };
    if (
      event.provider !== provider.id ||
      !event.providerReference ||
      event.providerReference.length > 160 ||
      (event.providerSubscriptionReference !== undefined && event.providerSubscriptionReference.length > 160) ||
      !Number.isSafeInteger(event.amount) ||
      event.amount < 0 ||
      !/^[a-zA-Z]{3}$/.test(event.currency)
    ) {
      set.status = 400;
      return { error: "INVALID_PAYMENT_EVENT" };
    }

    const outcome = await settleVerifiedPayment({ ...event, currency: event.currency.toUpperCase() });
    if (outcome === "not_found") { set.status = 404; return { error: "PAYMENT_NOT_FOUND" }; }
    if (outcome === "amount_mismatch") { set.status = 400; return { error: "PAYMENT_AMOUNT_MISMATCH" }; }
    if (outcome === "subscription_cancelled" || outcome === "renewal_reference_missing") {
      set.status = 409;
      return { error: outcome === "subscription_cancelled" ? "SUBSCRIPTION_CANCELLED" : "RENEWAL_REFERENCE_MISSING" };
    }
    return { received: true, outcome };
  })
  .post("/auth/register", async ({ body, set }) => {
    const email = body.email.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    if (existing.length > 0) {
      set.status = 409;
      return { error: "EMAIL_ALREADY_REGISTERED" };
    }

    const passwordHash = await Bun.password.hash(body.password, { algorithm: "argon2id" });
    const [user] = await db.insert(users).values({
      email,
      passwordHash,
      displayName: body.displayName?.trim() || null
    }).returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt
    });

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt
    });

    set.status = 201;
    return { user, token, expiresAt };
  }, {
    body: t.Object({
      email: t.String({ format: "email", maxLength: 255 }),
      password: t.String({ minLength: 8, maxLength: 128 }),
      displayName: t.Optional(t.String({ maxLength: 120 }))
    })
  })
  .post("/auth/login", async ({ body, set }) => {
    const email = body.email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user || !(await Bun.password.verify(body.password, user.passwordHash))) {
      set.status = 401;
      return { error: "INVALID_EMAIL_OR_PASSWORD" };
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      },
      token,
      expiresAt
    };
  }, {
    body: t.Object({
      email: t.String({ format: "email", maxLength: 255 }),
      password: t.String({ minLength: 8, maxLength: 128 })
    })
  })
  .get("/auth/me", async ({ request, set }) => {
    const token = getBearerToken(request.headers.get("authorization") ?? undefined);
    if (!token) {
      set.status = 401;
      return { error: "UNAUTHORIZED" };
    }

    const [session] = await db.select({
      userId: sessions.userId,
      expiresAt: sessions.expiresAt
    }).from(sessions).where(and(
      eq(sessions.tokenHash, hashToken(token)),
      gt(sessions.expiresAt, new Date())
    )).limit(1);

    if (!session) {
      set.status = 401;
      return { error: "SESSION_INVALID_OR_EXPIRED" };
    }

    const [user] = await db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt
    }).from(users).where(eq(users.id, session.userId)).limit(1);

    if (!user) {
      set.status = 401;
      return { error: "USER_NOT_FOUND" };
    }

    return { user };
  })
  .post("/auth/logout", async ({ request, set }) => {
    const token = getBearerToken(request.headers.get("authorization") ?? undefined);
    if (!token) {
      set.status = 204;
      return;
    }

    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    set.status = 204;
    return;
  })
  .listen(port);

console.log(`🟢 API running at http://localhost:${app.server?.port}`);
