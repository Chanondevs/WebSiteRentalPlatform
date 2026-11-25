CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('STORE', 'BUSINESS', 'POS');--> statement-breakpoint
CREATE TYPE "public"."website_status" AS ENUM('DRAFT', 'ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"provider" varchar(60) NOT NULL,
	"provider_reference" varchar(160),
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'THB' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'PENDING' NOT NULL,
	"term_months" integer NOT NULL,
	"amount" integer NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" varchar(600) NOT NULL,
	"category" "template_category" NOT NULL,
	"monthly_price" integer NOT NULL,
	"yearly_price" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"default_content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"subdomain" varchar(80) NOT NULL,
	"status" "website_status" DEFAULT 'DRAFT' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "websites_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_subscription_id_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payments_provider_reference_idx" ON "payments" USING btree ("provider_reference");--> statement-breakpoint
CREATE INDEX "subscriptions_owner_status_idx" ON "subscriptions" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_website_id_idx" ON "subscriptions" USING btree ("website_id");--> statement-breakpoint
CREATE INDEX "templates_category_active_idx" ON "templates" USING btree ("category","is_active");--> statement-breakpoint
CREATE INDEX "websites_owner_id_idx" ON "websites" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "websites_template_id_idx" ON "websites" USING btree ("template_id");--> statement-breakpoint
INSERT INTO "templates" ("slug","name","description","category","monthly_price","yearly_price","default_content") VALUES
('shop-mellow','ร้านค้าพร้อมขาย','จัดการสินค้า โปรโมชัน และช่องทางติดต่อในหน้าเดียว','STORE',49000,490000,'{"theme":"mellow","heroTitle":"ช้อปสิ่งที่ใช่ในทุกวัน","sections":["hero","products","contact"]}'::jsonb),
('company-north','ภาพลักษณ์มืออาชีพ','นำเสนอบริษัท บริการ ผลงาน และข้อมูลติดต่อ','BUSINESS',39000,390000,'{"theme":"north","heroTitle":"เติบโตไปด้วยกัน","sections":["hero","about","services","contact"]}'::jsonb),
('pos-daily','หน้าร้านจัดการง่าย','เริ่มจากหน้าแนะนำร้าน พร้อมต่อยอดระบบจัดการหน้าร้าน','POS',79000,790000,'{"theme":"daily","heroTitle":"จัดการร้านได้ทุกวัน","sections":["hero","menu","hours","contact"]}'::jsonb)
ON CONFLICT ("slug") DO NOTHING;
