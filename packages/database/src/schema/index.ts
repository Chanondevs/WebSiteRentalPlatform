import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  index,
  boolean,
  integer,
  jsonb,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);
export const templateCategoryEnum = pgEnum("template_category", ["STORE", "BUSINESS", "POS"]);
export const websiteStatusEnum = pgEnum("website_status", ["DRAFT", "ACTIVE", "SUSPENDED"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["PENDING", "ACTIVE", "EXPIRED", "CANCELLED"]);
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "PAID", "FAILED", "REFUNDED"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 120 }),
  role: userRoleEnum("role").notNull().default("USER"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt)
]);

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  description: varchar("description", { length: 600 }).notNull(),
  category: templateCategoryEnum("category").notNull(),
  monthlyPrice: integer("monthly_price").notNull(),
  yearlyPrice: integer("yearly_price").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  defaultContent: jsonb("default_content").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("templates_category_active_idx").on(table.category, table.isActive)]);

export const websites = pgTable("websites", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").notNull().references(() => templates.id),
  name: varchar("name", { length: 160 }).notNull(),
  subdomain: varchar("subdomain", { length: 80 }).notNull().unique(),
  status: websiteStatusEnum("status").notNull().default("DRAFT"),
  content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("websites_owner_id_idx").on(table.ownerId),
  index("websites_template_id_idx").on(table.templateId)
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  websiteId: uuid("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: subscriptionStatusEnum("status").notNull().default("PENDING"),
  termMonths: integer("term_months").notNull(),
  amount: integer("amount").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  autoRenew: boolean("auto_renew").notNull().default(false),
  providerSubscriptionReference: varchar("provider_subscription_reference", { length: 160 }),
  nextBillingAt: timestamp("next_billing_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("subscriptions_owner_status_idx").on(table.ownerId, table.status),
  index("subscriptions_website_id_idx").on(table.websiteId),
  index("subscriptions_next_billing_at_idx").on(table.nextBillingAt)
]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 60 }).notNull(),
  providerReference: varchar("provider_reference", { length: 160 }),
  status: paymentStatusEnum("status").notNull().default("PENDING"),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("THB"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("payments_subscription_id_idx").on(table.subscriptionId),
  uniqueIndex("payments_provider_reference_unique").on(table.provider, table.providerReference)
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Website = typeof websites.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
