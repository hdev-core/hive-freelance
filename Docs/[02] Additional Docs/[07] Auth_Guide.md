# 07 — Auth Guide

**Project:** Hive Freelance Escrow Platform  
**Source:** [`[04] Auth_Roles_Strategy.md`](../[03]%20System_Architecture_Data_Model/[04]%20Auth_Roles_Strategy.md)

---

## Paths

| Path | Who | How |
|------|-----|-----|
| **Keychain** | Existing Hive users | `GET /auth/challenge` → sign buffer → `POST /auth/verify` |
| **Google** | Users without Hive | OAuth consent → provision Hive account + RC + custodial keys |
| **Dev Google** | Local demos | `POST /auth/dev-google` `{ email }` (non-production) |
| **Dev login** | Local demos | `POST /auth/dev-login` `{ username }` (non-production) |
| **Claim** | Google custodial → self-custody | `POST /auth/me/claim-account` with four public keys |

All successful logins set the same JWT cookie: `hf_token`.

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

## Google + provisioning

1. `GET /auth/google` redirects to Google (requires `GOOGLE_CLIENT_ID` / `SECRET` / `REDIRECT_URI`).
2. Callback exchanges code → looks up `oauth_accounts` by Google `sub`.
3. New users: allocate Hive username (`hf…`), dry-run `account_create` + RC delegation, store custodial refs in local vault, insert `users` (`auth_type=google`) + `oauth_accounts`.
4. JWT issued; redirect to web `/login?google=1`.

**Dev without Google Console:**

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/v1/auth/dev-google ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"you@example.com\",\"role\":\"both\"}"
```

---

## Claim account

Only `auth_type=google` users.

```bash
curl -b cookies.txt -X POST http://localhost:4000/api/v1/auth/me/claim-account ^
  -H "Content-Type: application/json" ^
  -d "{\"owner_key\":\"STM...\",\"active_key\":\"STM...\",\"posting_key\":\"STM...\",\"memo_key\":\"STM...\"}"
```

- Builds `account_update2` (dry-run unless `CLAIM_LIVE=true`)
- Wipes custodial vault refs
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
| `CLAIM_LIVE` | Broadcast account_update2 (default false) |
| `CUSTODIAL_LIVE` | Live custodial escrow signing (default false) |
| `JWT_SECRET` | Required |
| `WEB_ORIGIN` | Post-OAuth redirect + CORS |

---

## Web UI

| URL | Action |
|-----|--------|
| `/login` | Keychain, Dev login, Dev Google, Continue with Google |
| `/claim` | Submit four public keys to claim custodial account |
| `/jobs` | Shows signed-in `@username` |

---

## Security notes

- Never commit real active/owner keys.
- Local KMS is an in-memory / stub vault — not production-safe.
- Agent + per-user custodial keys must move to real KMS/HSM before mainnet (see escrow hardening doc).
