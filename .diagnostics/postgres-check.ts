import postgres from "postgres";
const sql = postgres("postgres://postgres:postgres@localhost:5432/website_rental", { connect_timeout: 3 });
try {
  const result = await sql`select current_database(), current_user`;
  console.log("POSTGRES_OK", result);
} catch (error) {
  const e = error as { code?: string; message?: string };
  console.log("POSTGRES_ERROR", e.code, e.message);
} finally {
  await sql.end();
}
