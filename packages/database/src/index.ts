import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// Resolve the project root .env from this file so the API works from any working directory.
config({ path: resolve(import.meta.dir, "../../../.env") });

const connectionString =
  Bun.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/website_rental";

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
});

export const db = drizzle(client, { schema });
export { client };
export * from "./schema";
