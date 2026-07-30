/**
 * Bootstrap local HAF-compatible DB on an already-running Postgres volume
 * (docker-entrypoint-initdb.d only runs on first init).
 *
 * Usage: npm run db:bootstrap-haf
 * Env: HAF_DATABASE_URL or DATABASE_URL (loaded from repo-root .env)
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");
loadEnv({ path: resolve(rootDir, ".env") });

const schemaPath = resolve(__dirname, "schema.sql");

function resolveTargets() {
  const haf = process.env.HAF_DATABASE_URL;
  if (haf) {
    const u = new URL(haf);
    const targetDb = u.pathname.replace(/^\//, "") || "hive_haf";
    u.pathname = "/postgres";
    return { admin: u.toString(), targetDb, target: haf };
  }
  const app = process.env.DATABASE_URL;
  if (!app) {
    throw new Error(
      "Set HAF_DATABASE_URL or DATABASE_URL (e.g. postgresql://hive:hive@localhost:5433/hive_freelance)",
    );
  }
  const u = new URL(app);
  const targetDb = "hive_haf";
  u.pathname = "/postgres";
  const admin = u.toString();
  u.pathname = `/${targetDb}`;
  return { admin, targetDb, target: u.toString() };
}

function assertSafeDbName(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe database name: ${name}`);
  }
}

async function main() {
  const { admin, targetDb, target } = resolveTargets();
  assertSafeDbName(targetDb);

  const adminClient = new pg.Client({ connectionString: admin });
  await adminClient.connect();

  const exists = await adminClient.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [targetDb],
  );
  if (exists.rowCount === 0) {
    await adminClient.query(`CREATE DATABASE ${targetDb}`);
    console.log(`[haf-bootstrap] created database ${targetDb}`);
  } else {
    console.log(`[haf-bootstrap] database ${targetDb} already exists`);
  }
  await adminClient.end();

  const schemaClient = new pg.Client({ connectionString: target });
  await schemaClient.connect();
  const sql = readFileSync(schemaPath, "utf8");
  await schemaClient.query(sql);
  await schemaClient.end();

  console.log(
    `[haf-bootstrap] applied schema + seed → ${target.replace(/:[^:@/]+@/, ":***@")}`,
  );
}

main().catch((err) => {
  console.error("[haf-bootstrap] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
