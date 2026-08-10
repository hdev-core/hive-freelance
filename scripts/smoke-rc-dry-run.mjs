/**
 * Phase E smoke: prove delegateRc dry-run with PROVISIONER_LIVE=false.
 * Run: node scripts/smoke-rc-dry-run.mjs
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(root, ".env") });

process.env.PROVISIONER_LIVE = "false";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://hive:hive@localhost:5433/hive_freelance";
}
if (!process.env.HIVE_API_NODE) {
  process.env.HIVE_API_NODE = "https://api.hive.blog";
}

const { delegateRc, provisionGoogleUser } = await import(
  "../apps/provisioner/dist/index.js"
);

const email = `rc-stub-demo-${Date.now()}@example.com`;
console.log(`[smoke-rc] PROVISIONER_LIVE=${process.env.PROVISIONER_LIVE}`);
console.log(`[smoke-rc] provisioning ${email}`);

const result = await provisionGoogleUser({ email });
console.log(
  JSON.stringify(
    {
      hiveUsername: result.hiveUsername,
      accountDryRun: result.account.dryRun,
      rcDryRun: result.rc?.dryRun ?? null,
      rcMessage: result.rc?.message ?? null,
      rcWarning: result.rcWarning,
    },
    null,
    2,
  ),
);

await delegateRc(result.hiveUsername);
console.log("[smoke-rc] ok");
