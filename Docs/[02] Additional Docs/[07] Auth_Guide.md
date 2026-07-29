# 07 — Auth Guide

**Project:** Hive Freelance Escrow Platform  
**Source:** [`[04] Auth_Roles_Strategy.md`](../[03]%20System_Architecture_Data_Model/[04]%20Auth_Roles_Strategy.md)

---

## Paths

| Path | Who | How |
|------|-----|-----|
| **Keychain** | Existing Hive users | `GET /auth/challenge` → sign buffer → `POST /auth/verify` |
| **Google** | Users without Hive | OAuth consent → provision Hive account + RC + custodial keys |
| **Dev Google** | Local demos | `POST /auth/dev-google` `{ email }` (dev-gated, see below) |
| **Dev Keychain login** | Local demos / CI | `POST /auth/dev-keychain-login` `{ role? }` (dev-gated, see below) |
| **Claim** | Google custodial → self-custody | `POST /auth/me/claim-account` with four public keys |

All successful logins set the same JWT cookie: `hf_token`.

`GET /auth/challenge` validates the username's shape (3-16 chars per segment, lowercase letters/digits/hyphens — real Hive account-name rules) before ever calling the chain, and returns a clean `400 INVALID_USERNAME` for malformed input instead of forwarding the chain node's raw internal error.

### Dev-only route gating

`POST /auth/dev-google` and `POST /auth/dev-keychain-login` require **both**:
1. `NODE_ENV` is not exactly `"production"`, and
2. `ENABLE_DEV_AUTH_ROUTES=true`

Both checks exist so a misconfigured staging/preview deploy (`NODE_ENV` unset or something other than `production`) can't accidentally expose them — you have to opt in explicitly. Both routes log a warning to the server console every time they're used.

There is no more raw `POST /auth/dev-login` (arbitrary username, no signature at all) — it's been replaced by `dev-keychain-login`, which signs a real challenge with a seeded account's real posting key and runs it through the exact same `verifyPostingSignature()` path a production Keychain login uses. See "Seeded dev signer account" below.

---

## JWT cookie

```json
{ "sub": "42", "username": "alice", "role": "freelancer", "iat": …, "exp": … }
```

| Property | Value |
|----------|--------|
| Cookie name | `hf_token` |
| Flags | `httpOnly`, `Secure` (prod), `SameSite=Strict` |
| TTL | 24 hours |
| Also accepted | `Authorization: Bearer <token>` |

Local Vite uses an empty `VITE_API_BASE_URL` so the browser talks to the API through the same-origin proxy — Strict cookies work.

---

## Roles

| Role | Can |
|------|-----|
| `client` | Post jobs, accept proposals, fund/approve/release |
| `freelancer` | Propose, submit, ratify, cooperative refund |
| `both` | All of the above; **cannot** be both parties on one contract |

Switch role while logged in: `PUT /auth/me/role` `{ "role": "client" }`.

---

## Seeded dev signer account

`POST /auth/dev-keychain-login` needs a **real Hive account** whose posting key it can sign challenges with — this exercises genuine ECDSA verification in dev instead of a fake-signature bypass (the old `AUTH_RELAXED` flag, which accepted any signature ≥40 chars with no crypto check, has been removed entirely).

**There is no usable public Hive testnet for this.** The official Hive testnet (developers.hive.io/testnet) requires compiling and running your own `hived` node — there's no shared, publicly-reachable testnet API node or faucet. So this seed account is a real (but free, low-value, throwaway) **mainnet** account, verified against the same public API node (`HIVE_API_NODE`, default `https://api.hive.blog`) everything else already uses. Do not use an account you care about — its posting key will live in your local `.env`.

**One-time setup (a few minutes, do this yourself — it's a signup form, can't be scripted):**
1. Create a free Hive account via a sponsored signup service — no payment needed, the creation fee is covered for you:
   - https://signup.hive.io/, or
   - https://hiveonboard.com/, or
   - https://peakd.com/join
2. After signup you'll be shown (or emailed) a set of keys. Copy the **posting** private key (WIF format, starts with `5`).
3. Set in your untracked `.env` (leave `HIVE_API_NODE` as the mainnet default — no change needed there):
   ```
   DEV_SEED_HIVE_USERNAME=your-new-account-name
   DEV_SEED_POSTING_KEY=5J...
   ENABLE_DEV_AUTH_ROUTES=true
   ```
4. Restart the API. `POST /auth/dev-keychain-login` now: requests a real challenge for that account, signs it server-side with the seeded WIF key (`apps/api/src/lib/devSeedSigner.ts`), and verifies it through the same code path as a browser Keychain login.

Never commit `DEV_SEED_POSTING_KEY` — it's a real private key, even if the account itself is throwaway/low-value.

---

## Google + provisioning

1. `GET /auth/google` redirects to Google (requires `GOOGLE_CLIENT_ID` / `SECRET` / `REDIRECT_URI`).
2. Callback exchanges code → looks up `oauth_accounts` by Google `sub`.
3. New users: allocate Hive username (`hf…`), generate a real owner/active/posting/memo keypair server-side (held only in the in-memory custodial vault, never returned to the client or logged — see `packages/hive/src/custodialVault.ts`), `account_create` + RC delegation (dry-run by default — **the default (`PROVISIONER_LIVE=false`) is what you want for normal local testing**; it still generates real keys and a real DB-mapped user, it just doesn't broadcast). Setting `PROVISIONER_LIVE=true` broadcasts against mainnet (there's no usable public testnet — see "Seeded dev signer account" above) via a real, funded `PROVISIONER_CREATOR_ACCOUNT` and costs real HIVE for the account-creation fee; only do this deliberately, not for routine dev sign-in testing. Insert `users` (`auth_type=google`) + `oauth_accounts`.
4. Concurrent first-logins for the same Google identity are serialized with a Postgres advisory lock (keyed by a hash of the Google `sub`) so two simultaneous callbacks can't provision two different Hive accounts for one person.
5. If RC delegation fails after the account was created, the user/account mapping is still saved (not lost) and a warning is logged/returned — the account can be re-delegated later rather than being orphaned.
6. JWT issued; redirect to web `/login?google=1`.

**Dev without Google Console:**

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/v1/auth/dev-google ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"you@example.com\",\"role\":\"both\"}"
```

(Requires `ENABLE_DEV_AUTH_ROUTES=true` — see "Dev-only route gating" above.)

---

## Claim account

Only `auth_type=google` users.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/v1/auth/me/claim-account ^
  -H "Content-Type: application/json" ^
  -d "{\"owner_key\":\"STM...\",\"active_key\":\"STM...\",\"posting_key\":\"STM...\",\"memo_key\":\"STM...\"}"
```

- Builds `account_update2` (dry-run unless `CLAIM_LIVE=true`)
- Wipes custodial vault keys
- Sets `auth_type=claimed`, clears `kms_key_ref`
- User must install Keychain afterwards

---

## Custodial escrow signing

Escrow payload endpoints return `mode: "keychain" | "custodial"`.

Google users can call:

`POST /api/v1/payments/:id/custodial-sign` `{ "op": "escrow_transfer", "payload": { … } }`

Dry-run unless `CUSTODIAL_LIVE=true`.

---

## Env flags

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` / `SECRET` / `REDIRECT_URI` | Real Google OAuth |
| `PROVISIONER_LIVE` | Broadcast account_create / RC (default false) |
| `HIVE_ACCOUNT_CREATION_FEE` | Fee amount for live `account_create` (default `3.000 HIVE` — real mainnet fee, no testnet) |
| `HIVE_RC_DELEGATION_VESTS` | VESTS delegated to new accounts in live mode (default `10.000000 VESTS`) |
| `CLAIM_LIVE` | Broadcast account_update2 (default false) |
| `CUSTODIAL_LIVE` | Live custodial escrow signing (default false) |
| `JWT_SECRET` | Required — no fallback; the app refuses to start without it |
| `ENABLE_DEV_AUTH_ROUTES` | Opt-in (with `NODE_ENV != production`) for dev-google / dev-keychain-login |
| `DEV_SEED_HIVE_USERNAME` / `DEV_SEED_POSTING_KEY` | Seeded real (mainnet, throwaway) account for dev-keychain-login — see "Seeded dev signer account" |
| `WEB_ORIGIN` | Post-OAuth redirect + CORS |

---

## Web UI

| URL | Action |
|-----|--------|
| `/login` | Keychain, Dev sign in (seeded account), Continue with Google |
| `/claim` | Submit four public keys to claim custodial account |
| `/jobs` | Shows signed-in `@username` |

---

## Security notes

- Never commit real active/owner keys, or `DEV_SEED_POSTING_KEY` — it's a real mainnet posting key (throwaway account, but still a real key).
- `.env.example` is a template only — it is never loaded by the running app (both `apps/api` and `apps/listener` load only `.env`). Set every required value in your own untracked `.env`.
- Local KMS is an in-memory / stub vault — not production-safe.
- Custodial keys for Google-provisioned users are real keypairs generated server-side (`hive-tx` `PrivateKey.randomKey()`), held only in the in-memory vault, and never logged or returned to any client. Agent + per-user custodial keys must still move to real KMS/HSM before mainnet (see escrow hardening doc) — the in-memory vault does not survive a process restart and isn't wired into `packages/hive/src/kms.ts`'s signing path yet, so live custodial escrow signing (`claim-account`, `custodial-sign`) remains a follow-up beyond this auth card.
