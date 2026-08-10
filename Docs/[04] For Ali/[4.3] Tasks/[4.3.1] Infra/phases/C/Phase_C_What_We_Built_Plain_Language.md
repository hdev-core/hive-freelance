# Phase C — What we built (plain language)

> For Ali / teammates who want the “what & why” without deep code.  
> **Date:** 2026-07-27 · **Related evidence:** [`[06] Phase_C_Wax_Custom_Json_Evidence.md`](Phase_C_Wax_Custom_Json_Evidence.md)

---

## 1. What problem this solves

Our app must talk to the Hive blockchain using the **official toolkit** the team agreed on (**WAX**), not an older library (**dhive**).

One common message type on Hive is **`custom_json`**: a small labeled note the app can post on-chain (like stamping “this happened in Hive Freelance”).

Milestone 1 asks us to prove we can **build that message with WAX**, and either send it for real or **mock** the send safely for demos.

---

## 2. Simple picture

```text
You (or a demo button/curl)
        │
        ▼
   Our API demo endpoint
        │
        ▼
   WAX toolkit builds the custom_json message
        │
        ├─ Default: “practice mode” → fake transaction id (safe)
        └─ Optional live flag: only if keys + flag are set
```

---

## 3. What we built

| Piece | In plain words |
|-------|----------------|
| **WAX helper** | A shared function that loads WAX and builds a real `custom_json` message for our app id (`hive-freelance-v1`). |
| **Mock by default** | Returns a fake id like `mock-wax-custom-json-…` so we don’t spend real chain actions during everyday demos. |
| **Demo API** | A small “try it” endpoint for developers: `POST /api/v1/health/wax-custom-json-demo`. |
| **Safety switch** | The demo only works in non-production when `ENABLE_DEV_AUTH_ROUTES=true`. Live sending needs another explicit flag. |

---

## 4. Mock vs live (why it matters)

- **Mock (default):** Like a dress rehearsal — we prove the costume (WAX message) is correct without going on stage (broadcast).
- **Live (opt-in):** Actually try to send. We refuse to pretend it worked if keys aren’t configured.

For Milestone 1 acceptance, **mock is enough**, as long as the message was clearly built with WAX.

---

## 5. How you can try it (2 minutes)

1. Keep Postgres running in Docker.
2. In `.env`: `ENABLE_DEV_AUTH_ROUTES=true` and `WAX_CUSTOM_JSON_LIVE=false`.
3. Restart `npm run dev`.
4. Call the demo endpoint (see `[06]` for curl).
5. You should get JSON with `dryRun: true`, `waxLoaded: true`, and a `custom_json` operation.

---

## 6. What this is not

- Not the full jobs/escrow product flow.
- Not HAF (reading the chain into SQL) — that’s a later phase.
- Not “we always broadcast to mainnet now.”

---

## 7. One-sentence summary

> We taught the app to write a Hive `custom_json` message using WAX, exposed a safe practice demo that returns a mock transaction id, and wrote down how to prove it.
