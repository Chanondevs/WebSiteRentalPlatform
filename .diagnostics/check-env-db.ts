import { config } from "dotenv";
import postgres from "postgres";
config({ path: "../.env" });
const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL_MISSING");
  process.exit(2);
}
const sql = postgres(url, { connect_timeout: 5 });
try {
  const rows = await sql`select current_database() as db, current_user as usr`;
  console.log("DATABASE_CONNECTION_OK", rows[0]?.db, rows[0]?.usr);
} catch (error) {
  const e = error as { code?: string; message?: string };
  console.log("DATABASE_CONNECTION_FAILED", e.code ?? "unknown");
  console.log(String(e.message ?? "unknown error").replace(/postgres:\/\/[^\s]+/g, "[REDACTED]"));
  process.exitCode = 1;
} finally {
  await sql.end();
}
