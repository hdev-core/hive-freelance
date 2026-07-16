import { config as loadEnv } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../../..");
loadEnv({ path: resolve(rootDir, ".env") });
loadEnv({ path: resolve(rootDir, ".env.example") });

const migrationsDir = join(__dirname, "..", "migrations");

async function migrate(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const id = file;
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE id = $1",
        [id],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        console.log(`skip  ${id}`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [
          id,
        ]);
        await client.query("COMMIT");
        console.log(`apply ${id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("Migrations complete.");
  } finally {
    client.release();
    await closePool();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
