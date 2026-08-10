# Phase C — WAX custom_json evidence (acceptance #3)

> **Owner:** Ali · **Date:** 2026-07-27  
> **Code:** `packages/hive/src/waxTx.ts` · `POST /api/v1/health/wax-custom-json-demo`  
> **Plain-language summary:** [`[07] Phase_C_What_We_Built_Plain_Language.md`](Phase_C_What_We_Built_Plain_Language.md)

---

## Acceptance #3

A **WAX-built** `custom_json` op broadcasts on testnet **or** a clear **mock** with evidence.

- [x] Built via `@hiveio/wax` (`custom_json.create` + `createTransaction` + `pushOperation`)
- [x] Default mock `hive_tx_id` + `dryRun: true`
- [x] Dev demo endpoint gated by `ENABLE_DEV_AUTH_ROUTES`
- [x] No `@hiveio/dhive`

---

## How to run the demo

1. Docker Postgres up + `npm run dev`
2. In `.env` set:
   ```env
   ENABLE_DEV_AUTH_ROUTES=true
   WAX_CUSTOM_JSON_LIVE=false
   ```
3. Restart API, then:

```bash
# PowerShell-friendly: use curl.exe
curl.exe -s -X POST "http://127.0.0.1:4000/api/v1/health/wax-custom-json-demo" ^
  -H "Content-Type: application/json" ^
  -d "{\"account\":\"gtg\",\"note\":\"Phase C demo\"}"
```

Or Node:

```js
await fetch("http://127.0.0.1:4000/api/v1/health/wax-custom-json-demo", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account: "gtg" }),
}).then((r) => r.json());
```

---

## Expected response shape

```json
{
  "ok": true,
  "dryRun": true,
  "hive_tx_id": "mock-wax-custom-json-…",
  "waxLoaded": true,
  "path": "wax",
  "operation": {
    "type": "custom_json_operation",
    "value": {
      "required_auths": [],
      "required_posting_auths": ["gtg"],
      "id": "hive-freelance-v1",
      "json": "{\"app\":\"hive-freelance-v1\",\"kind\":\"m1_wax_demo\",…}"
    }
  },
  "transaction": { "operations": [ … ], "signatures": [] },
  "message": "Dry-run: WAX built custom_json + unsigned tx. …"
}
```

Server log should include: `[waxTx] built via @hiveio/wax …`

---

## Code path

| Step | File |
|------|------|
| Helper | `packages/hive/src/waxTx.ts` → `buildCustomJsonDemo` |
| Export | `packages/hive/src/index.ts` |
| Endpoint | `apps/api/src/routes/health.ts` → `POST /api/v1/health/wax-custom-json-demo` |
| Env | `.env.example` → `WAX_CUSTOM_JSON_LIVE`, `ENABLE_DEV_AUTH_ROUTES` |

Live flag: `WAX_CUSTOM_JSON_LIVE=true` requires agent KMS key; refuses fake success without it.

---

## Smoke (helper, no HTTP)

Ran `buildCustomJsonDemo({ account: "gtg" })` successfully during implementation — returns `waxLoaded: true`, `dryRun: true`, WAX unsigned tx with `custom_json_operation`.
