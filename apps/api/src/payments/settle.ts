import { and, eq } from "drizzle-orm";
import { db, payments, subscriptions } from "@website-rental/database";
import type { VerifiedPaymentEvent } from "./provider";

export type SettlementOutcome =
  | "paid"
  | "failed"
  | "duplicate"
  | "not_found"
  | "amount_mismatch"
  | "subscription_cancelled"
  | "renewal_reference_missing";

function addUtcMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * Apply only a normalized event that has already passed provider signature
 * verification. Conditional status updates make repeated webhooks harmless.
 */
export async function settleVerifiedPayment(event: VerifiedPaymentEvent): Promise<SettlementOutcome> {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select({
      id: payments.id,
      subscriptionId: payments.subscriptionId,
      status: payments.status,
      amount: payments.amount,
      currency: payments.currency
    }).from(payments).where(and(
      eq(payments.provider, event.provider),
      eq(payments.providerReference, event.providerReference)
    )).limit(1);

    if (!payment) return "not_found";
    if (payment.amount !== event.amount || payment.currency !== event.currency.toUpperCase()) return "amount_mismatch";
    if (payment.status !== "PENDING") return "duplicate";

    if (event.status === "failed") {
      const [failed] = await tx.update(payments).set({ status: "FAILED" }).where(and(
        eq(payments.id, payment.id),
        eq(payments.status, "PENDING")
      )).returning({ id: payments.id });
      return failed ? "failed" : "duplicate";
    }

    const [subscription] = await tx.select({
      id: subscriptions.id,
      status: subscriptions.status,
      termMonths: subscriptions.termMonths,
      startsAt: subscriptions.startsAt,
      endsAt: subscriptions.endsAt,
      autoRenew: subscriptions.autoRenew,
      providerSubscriptionReference: subscriptions.providerSubscriptionReference
    }).from(subscriptions).where(eq(subscriptions.id, payment.subscriptionId)).limit(1);

    if (!subscription) return "not_found";
    if (subscription.status === "CANCELLED") return "subscription_cancelled";
    if (subscription.autoRenew && !event.providerSubscriptionReference && !subscription.providerSubscriptionReference) {
      return "renewal_reference_missing";
    }

    const paidAt = event.paidAt && Number.isFinite(event.paidAt.getTime()) ? event.paidAt : new Date();
    const [paid] = await tx.update(payments).set({ status: "PAID", paidAt }).where(and(
      eq(payments.id, payment.id),
      eq(payments.status, "PENDING")
    )).returning({ id: payments.id });
    if (!paid) return "duplicate";

    const startsAt = subscription.endsAt && subscription.endsAt > paidAt ? subscription.endsAt : paidAt;
    const endsAt = addUtcMonths(startsAt, subscription.termMonths);
    await tx.update(subscriptions).set({
      status: "ACTIVE",
      startsAt: subscription.startsAt ?? startsAt,
      endsAt,
      nextBillingAt: subscription.autoRenew ? endsAt : null,
      providerSubscriptionReference: event.providerSubscriptionReference ?? subscription.providerSubscriptionReference,
      updatedAt: new Date()
    }).where(eq(subscriptions.id, subscription.id));

    return "paid";
  });
}
