import { config } from "dotenv";
import postgres from "postgres";
config({ path: "../.env" });
const url = new URL(process.env.DATABASE_URL!);
url.pathname = "/postgres";
const sql = postgres(url.toString(), { connect_timeout: 5 });
try {
  await sql.unsafe("CREATE DATABASE website_rental");
  console.log("DATABASE_CREATED");
} catch (error) {
  const e = error as { code?: string; message?: string };
  if (e.code === "42P04") console.log("DATABASE_ALREADY_EXISTS");
  else {
    console.log("CREATE_DATABASE_FAILED", e.code ?? "unknown", e.message ?? "unknown error");
    process.exitCode = 1;
  }
} finally { await sql.end(); }
