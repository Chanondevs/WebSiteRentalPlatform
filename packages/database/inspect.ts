import { sql } from "drizzle-orm";
import { client, db, templates } from "./src/index";

try {
  const counts = await db.execute(sql`
    SELECT 'users' AS table_name, COUNT(*)::int AS records FROM users
    UNION ALL SELECT 'sessions', COUNT(*)::int FROM sessions
    UNION ALL SELECT 'templates', COUNT(*)::int FROM templates
    UNION ALL SELECT 'websites', COUNT(*)::int FROM websites
    UNION ALL SELECT 'subscriptions', COUNT(*)::int FROM subscriptions
    UNION ALL SELECT 'payments', COUNT(*)::int FROM payments
    ORDER BY table_name
  `);
  const catalog = await db.select({
    slug: templates.slug,
    name: templates.name,
    category: templates.category,
    monthlyPriceSatang: templates.monthlyPrice,
    yearlyPriceSatang: templates.yearlyPrice
  }).from(templates).orderBy(templates.category);

  console.log("DATABASE TABLE COUNTS");
  for (const row of counts) console.log(`  ${row.table_name}: ${row.records}`);
  console.log("TEMPLATE CATALOG (prices in satang)");
  for (const template of catalog) console.log(`  ${template.slug} | ${template.category} | ${template.name} | ${template.monthlyPriceSatang}/month | ${template.yearlyPriceSatang}/year`);
} finally {
  await client.end();
}
