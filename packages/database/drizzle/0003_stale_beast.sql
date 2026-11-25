DROP INDEX "payments_provider_reference_idx";--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "auto_renew" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "provider_subscription_reference" varchar(160);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "next_billing_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_unique" ON "payments" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "subscriptions_next_billing_at_idx" ON "subscriptions" USING btree ("next_billing_at");