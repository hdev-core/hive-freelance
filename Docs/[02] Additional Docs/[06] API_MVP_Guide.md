# 06 — API MVP Guide

**Project:** Hive Freelance Escrow Platform  
**Slice:** Architecture & API — MVP core (Keychain auth → escrow orchestration)

Companion to [`[03] Architecture_and_API.md`](../[03]%20System_Architecture_Data_Model/[03]%20Architecture_and_API.md). This document describes what is **implemented now** vs stubbed.

---

## Base URL

- API: `http://localhost:4000`
- Prefix: `/api/v1`
- Auth: JWT in httpOnly cookie `hf_token` (also accepts `Authorization: Bearer <token>`)
- CORS: credentials enabled for `http://localhost:5173`

```bash
docker compose up -d
npm run db:migrate
npm run dev
```

---

## Auth (Keychain)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/auth/challenge?username=` | — | 60s single-use challenge; `400 INVALID_USERNAME` for malformed usernames (before hitting the chain) |
| POST | `/auth/verify` | — | `{ username, signature, challenge, role? }` → sets cookie |
| POST | `/auth/dev-keychain-login` | — | Dev-gated (`ENABLE_DEV_AUTH_ROUTES=true`) — signs with a seeded (real, throwaway mainnet) account key, real verify, sets cookie |
| POST | `/auth/logout` | — | Clear cookie |
| GET | `/auth/me` | 🔒 | Current JWT user |
| GET | `/auth/google` | — | Real Google OAuth (see Auth_Guide.md) |
| POST | `/auth/me/claim-account` | 🔒 | See Auth_Guide.md |

### Smoke test (dev-keychain-login)

See [Auth_Guide.md](./%5B07%5D%20Auth_Guide.md) for one-time seeded dev signer account setup, then:

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/v1/auth/dev-keychain-login ^
  -H "Content-Type: application/json" ^
  -d "{\"role\":\"both\"}"

curl -b cookies.txt http://localhost:4000/api/v1/auth/me
```

There is no more `AUTH_RELAXED` fake-signature bypass — dev logins now always go through real ECDSA verification against a seeded (real mainnet, throwaway) account.

---

## Users & profiles

| Method | Path | Auth |
|--------|------|------|
| GET | `/users/:username` | — |
| PUT | `/users/me/profile` | 🔒 |
| GET | `/users/me/dashboard` | 🔒 |
| GET | `/users/:username/reviews` | — **501** |

---

## Jobs / proposals / contracts / milestones

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/jobs` | — | filters: `category`, `skill`, `status`, `page`, `limit` |
| GET | `/jobs/:id` | — | includes `proposalCount` |
| POST | `/jobs` | 🔒 | client / both |
| PUT | `/jobs/:id` | 🔒 | owner, while open |
| DELETE | `/jobs/:id` | 🔒 | owner, while open |
| GET | `/jobs/:id/proposals` | 🔒 | client |
| POST | `/jobs/:id/proposals` | 🔒 | freelancer |
| DELETE | `/proposals/:id` | 🔒 | withdraw pending |
| POST | `/proposals/:id/accept` | 🔒 | creates contract + `custom_json` payload |
| PATCH | `/proposals/:id/accept/confirm` | 🔒 | `{ hive_tx_id }` |
| POST | `/proposals/:id/reject` | 🔒 | client |
| GET | `/contracts` | 🔒 | |
| GET | `/contracts/:id` | 🔒 | + milestones + payments |
| POST | `/contracts/:id/complete` | 🔒 | dual-flag completion |
| POST | `/contracts/:id/cancel` | 🔒 | blocked if milestones funded+ |
| GET/POST | `/contracts/:id/milestones` | 🔒 | |
| POST | `/milestones/:id/submit` | 🔒 | freelancer |
| POST | `/milestones/:id/approve` | 🔒 | returns `custom_json` |
| PATCH | `/milestones/:id/approve/confirm` | 🔒 | |

### Off-chain loop (curl sketch)

```bash
# dev-keychain-login always signs in as the single seeded account
# (see Auth_Guide.md) — use Keychain /auth/verify with two real accounts,
# or the web UI's role switcher, to simulate distinct client/freelancer users.
curl -c alice.txt -X POST .../auth/dev-keychain-login -d "{\"role\":\"client\"}"

curl -b alice.txt -X POST .../jobs -d "{\"title\":\"Logo\",\"description\":\"Need a logo\",\"budget\":50}"
curl -b bob.txt   -X POST .../jobs/1/proposals -d "{\"cover_letter\":\"Hi\",\"bid_amount\":50}"
curl -b alice.txt -X POST .../proposals/1/accept
curl -b alice.txt -X POST .../contracts/1/milestones -d "{\"title\":\"Draft\",\"amount\":50,\"milestone_order\":1}"
```

---

## Payments (escrow payloads)

Server **does not broadcast** user transactions. Endpoints return Hive op shapes for Keychain.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/contracts/:id/milestones/:mid/fund` | Creates `payments` (`pending`), returns `escrow_transfer` (default **HBD**) |
| PATCH | `/payments/:id/confirm` | → `awaiting_ratification`; agent KMS approve is dry-run stub |
| POST | `/payments/:id/ratify` | Freelancer `escrow_approve` payload |
| PATCH | `/payments/:id/ratify/confirm` | Records freelancer side; marks milestone funded |
| POST | `/payments/:id/release` | Client `escrow_release` to freelancer |
| PATCH | `/payments/:id/release/confirm` | → `released` |
| POST | `/payments/:id/refund` | Cooperative refund to client |
| PATCH | `/payments/:id/refund/confirm` | → `refunded` |

Agent live `escrow_approve` broadcast is **not** live yet (KMS stub only). Full hardening: escrow integration doc 05.

---

## Listener payment sync

`apps/listener` processes blocks **only through LIB**, writes `hive_records`, and updates `payments` / `milestones` for matching `escrow_id`:

- `escrow_transfer` → ensure `awaiting_ratification`
- `escrow_approve` → `escrowed` + milestone `funded`
- `escrow_release` → `released` or `refunded`

---

## Stubbed (501)

- Disputes raise/resolve
- Reviews

(Google OAuth and claim-account are implemented, not stubbed — see the Auth table above and Auth_Guide.md.)

---

## Web smoke UI

| URL | Purpose |
|-----|---------|
| http://localhost:5173/login | Keychain login + dev-keychain-login |
| http://localhost:5173/jobs | Public job list + session check |
| http://localhost:5173/keychain | Extension smoke test |

---

## Env extras

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Required for tokens |
| `AGENT_ACCOUNT` | Named in escrow payloads |
| `ENABLE_DEV_AUTH_ROUTES` | Opt-in for dev-google / dev-keychain-login |
| `DEV_SEED_HIVE_USERNAME` / `DEV_SEED_POSTING_KEY` | Seeded real (mainnet, throwaway) account for dev-keychain-login |
| `VITE_API_BASE_URL` | Leave **empty** locally so the browser uses Vite’s `/api` proxy (same-origin cookies). |
| `API_PROXY_TARGET` | Vite proxy target (default `http://127.0.0.1:4000`) |
| `WEB_ORIGIN` | CORS origin (default `http://localhost:5173`) |
