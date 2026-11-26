import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";

const filename = process.argv[2];
if (!filename || !process.env.DATABASE_URL) {
  throw new Error("Pass a year JSON file and set DATABASE_URL.");
}

const catalog = JSON.parse(await readFile(filename, "utf8"));
if (catalog.schemaVersion !== 1 || !Number.isInteger(catalog.year) ||
    catalog.year < 2026 || catalog.year > 2100 ||
    !Array.isArray(catalog.reports) || !catalog.reports.length) {
  throw new Error("Invalid annual catalog.");
}
const sql = neon(process.env.DATABASE_URL);
await sql.transaction([
  sql`CREATE TABLE IF NOT EXISTS ash_catalogs (
    year integer PRIMARY KEY CHECK (year BETWEEN 2026 AND 2100),
    catalog jsonb NOT NULL CHECK (catalog->>'year' = year::text),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`INSERT INTO ash_catalogs (year, catalog)
      VALUES (${catalog.year}, ${JSON.stringify(catalog)}::jsonb)
      ON CONFLICT (year) DO UPDATE
      SET catalog = EXCLUDED.catalog, updated_at = now()`,
]);
console.log(`Saved ASH ${catalog.year} (${catalog.reports.length} abstracts).`);
