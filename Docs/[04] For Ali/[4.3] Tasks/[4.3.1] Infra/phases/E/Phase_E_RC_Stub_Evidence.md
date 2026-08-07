# Phase E — RC delegation stub evidence

> **Owner:** Ali · **Date:** 2026-07-30  
> **Closes:** Milestone 1 RC-delegation-on-provisioning stub (confirm, don’t expand)  
> **Related:** [`[01] work plan`](./[01]%20Milestone_1_Hive_Layer_Work_Plan.md) §11.4 · [`Auth_Guide`](../../[02]%20Additional%20Docs/[07]%20Auth_Guide.md)

---

## Plain language

When a Google user gets a new Hive account, the platform **prepares** to give it Resource Credits (RC) so it can broadcast later. For Milestone 1 this stays a **stub**: by default it only **logs a dry-run** and does **not** broadcast to mainnet. There is **no live RC pool** in this milestone.

---

## Env defaults (E2)

From [`.env.example`](../../../.env.example) — matches Auth + Local Dev guides:

| Variable | Default | Meaning |
|----------|---------|---------|
| `PROVISIONER_LIVE` | `false` | Dry-run `account_create` + RC; set `true` only for deliberate mainnet broadcast |
| `HIVE_RC_DELEGATION_VESTS` | `10.000000 VESTS` | Live-mode vesting amount only |
| `ENABLE_DEV_AUTH_ROUTES` | `false` | Gates `POST /api/v1/auth/dev-google` |

**M1 scope:** keep `PROVISIONER_LIVE=false` for normal demos.

---

## Smoke (E1) — captured 2026-07-30

Command:

```bash
node scripts/smoke-rc-dry-run.mjs
```

(Equivalent path: API with `ENABLE_DEV_AUTH_ROUTES=true` + `PROVISIONER_LIVE=false` → `POST /api/v1/auth/dev-google`.)

Log excerpt:

```text
[smoke-rc] PROVISIONER_LIVE=false
[smoke-rc] provisioning rc-stub-demo-1785440918336@example.com
[provisioner] dry-run account_create for @hfrcstubde296f46 (set PROVISIONER_LIVE=true to broadcast)
[provisioner] dry-run delegate_vesting_shares (RC) for @hfrcstubde296f46
{
  "hiveUsername": "hfrcstubde296f46",
  "accountDryRun": true,
  "rcDryRun": true,
  "rcMessage": "Dry-run: RC delegation not broadcast",
  "rcWarning": null
}
[provisioner] dry-run delegate_vesting_shares (RC) for @hfrcstubde296f46
[smoke-rc] ok
```

**Pass criteria**

- [x] Log contains `dry-run delegate_vesting_shares (RC)`
- [x] `rcDryRun: true` / message says not broadcast
- [x] No unexpected mainnet broadcast (`PROVISIONER_LIVE=false`)

Code: [`apps/provisioner/src/index.ts`](../../../apps/provisioner/src/index.ts) → `delegateRc()`.

---

## Status

- [x] E1 Confirm dry-run path  
- [x] E2 Env flags in `.env.example` + Auth Guide + Local Dev  
- [x] E3 Evidence note (this file) — RC stub, dry-run by default, not live pool  
