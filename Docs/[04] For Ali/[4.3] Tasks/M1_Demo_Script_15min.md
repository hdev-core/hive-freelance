# Milestone 1 — Demo script (≈15 minutes)

> **Audience:** Teammate reproducing Hive-layer acceptance  
> **Owner:** Ali · **Date:** 2026-07-30  
> **Source:** Work plan §14 · Evidence `[05]`–`[10]` · HAF handoff `[09]`

Say out loud when showing HAF: **“This is HAF, not the custom listener.”**

---

## 0. Pre-flight (≈2 min)

```bash
docker compose up -d
npm install
npm run db:migrate
npm run db:bootstrap-haf
```

`.env` essentials (see `.env.example`):

```env
DATABASE_URL=postgresql://hive:hive@localhost:5433/hive_freelance
DIRECT_URL=postgresql://hive:hive@localhost:5433/hive_freelance
HAF_DATABASE_URL=postgresql://hive:hive@localhost:5433/hive_haf
JWT_SECRET=…change-me…
ENABLE_DEV_AUTH_ROUTES=true
PROVISIONER_LIVE=false
WAX_CUSTOM_JSON_LIVE=false
```

```bash
npm run dev
```

| Check | Expect |
|-------|--------|
| `curl -s http://localhost:4000/health` | `ok` / db up |
| `npm ls @hiveio/dhive` | empty / not found |

---

## 1. Stack health (≈1 min)

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/api/v1/health/hive
curl -s http://localhost:4000/api/v1/health/haf
```

HAF health must include `"source":"haf"`. Evidence pattern: [`[08]`]([4.3.1]%20Infra/phases/D/Phase_D_HAF_Read_Evidence.md).

---

## 2. Keychain challenge (≈3 min) — acceptance #2

1. Open http://localhost:5173/login (Keychain installed + unlocked).
2. Login with a real Hive username → approve Posting sign.
3. Expect session / dashboard redirect.

Optional edge: cancel Keychain popup → clear error, can retry.

If extension unavailable in this session, show prior evidence: [`[05] Phase_B_Keychain_Evidence.md`]([4.3.1]%20Infra/phases/B/Phase_B_Keychain_Evidence.md).

---

## 3. WAX `custom_json` mock (≈2 min) — acceptance #3

Requires `ENABLE_DEV_AUTH_ROUTES=true`, `WAX_CUSTOM_JSON_LIVE=false`.

```bash
curl -s -X POST http://localhost:4000/api/v1/health/wax-custom-json-demo ^
  -H "Content-Type: application/json" ^
  -d "{\"note\":\"m1-demo\"}"
```

Expect mock / dry-run `hive_tx_id` and WAX path (not dhive). Evidence: [`[06]`]([4.3.1]%20Infra/phases/C/Phase_C_Wax_Custom_Json_Evidence.md) · plain language [`[07]`]([4.3.1]%20Infra/phases/C/Phase_C_What_We_Built_Plain_Language.md).

---

## 4. HAF account read (≈2 min) — acceptance #1

```bash
curl -s http://localhost:4000/api/v1/hive/accounts/hfdemo
```

Expect `"source":"haf"` + account + operations.  
**Say:** “this is HAF, not the custom listener.”

Evidence: [`[08]`]([4.3.1]%20Infra/phases/D/Phase_D_HAF_Read_Evidence.md). Real shared HAF cutover: [`[09]`]([4.3.1]%20Infra/phases/D/Phase_D_HAF_Handoff_for_Laure.md).

---

## 5. RC stub dry-run (≈2 min)

Keep `PROVISIONER_LIVE=false`.

```bash
node scripts/smoke-rc-dry-run.mjs
```

Or:

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/dev-google ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"demo-m1@example.com\",\"role\":\"client\"}"
```

Expect log:

```text
[provisioner] dry-run delegate_vesting_shares (RC) for @…
```

Evidence: [`[10] Phase_E_RC_Stub_Evidence.md`]([4.3.1]%20Infra/phases/E/Phase_E_RC_Stub_Evidence.md).

---

## 6. Close (≈1 min)

Open [`[01] Milestone_1_Hive_Layer_Work_Plan.md`]([4.3.1]%20Infra/[01]%20Milestone_1_Hive_Layer_Work_Plan.md) §8 definition of done and tick/show:

| Item | Evidence |
|------|----------|
| Keychain | `[05]` |
| WAX custom_json | `[06]` / `[07]` |
| HAF reads | `[08]` |
| RC stub dry-run | `[10]` |
| No dhive | `npm ls @hiveio/dhive` |
| WAX + HAF docs | Tech Stack + Local Dev |

If a step fails, use work plan §11.5 before blaming feature code.
