import { neon } from "@neondatabase/serverless";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  if (!process.env.DATABASE_URL) {
    return response.status(503).json({ error: "database_unconfigured" });
  }
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT catalog FROM ash_catalogs ORDER BY year DESC`;
    response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
    return response.status(200).json(rows.map(({ catalog }) => catalog));
  } catch (error) {
    console.error("Unable to load ASH catalogs", error.code ?? error.name);
    return response.status(503).json({ error: "catalog_unavailable" });
  }
}
