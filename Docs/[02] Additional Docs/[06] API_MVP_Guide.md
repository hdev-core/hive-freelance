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
| GET | `/auth/challenge?username=` | — | 60s single-use challenge |
| POST | `/auth/verify` | — | `{ username, signature, challenge, role? }` → sets cookie |
| POST | `/auth/dev-login` | — | **Non-production only** — upsert user, set cookie |
| POST | `/auth/logout` | — | Clear cookie |
| GET | `/auth/me` | 🔒 | Current JWT user |
| GET | `/auth/google` | — | **501** stub |
| POST | `/auth/me/claim-account` | 🔒 | **501** stub |

### Smoke test (dev-login)

```bash
curl -c cookies.txt -X POST http://localhost:4000/api/v1/auth/dev-login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"alice\",\"role\":\"both\"}"

curl -b cookies.txt http://localhost:4000/api/v1/auth/me
```

Optional: set `AUTH_RELAXED=true` in `.env` to skip ECDSA verify on Keychain signatures in non-production (not for real demos).

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
# alice = client, bob = freelancer (two shells / cookie jars)
curl -c alice.txt -X POST .../auth/dev-login -d "{\"username\":\"alice\",\"role\":\"client\"}"
curl -c bob.txt   -X POST .../auth/dev-login -d "{\"username\":\"bob\",\"role\":\"freelancer\"}"

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

- Google OAuth + claim-account
- Disputes raise/resolve
- Reviews

---

## Web smoke UI

| URL | Purpose |
|-----|---------|
| http://localhost:5173/login | Keychain login + dev-login |
| http://localhost:5173/jobs | Public job list + session check |
| http://localhost:5173/keychain | Extension smoke test |

---

## Env extras

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Required for tokens |
| `AGENT_ACCOUNT` | Named in escrow payloads |
| `AUTH_RELAXED` | Dev-only signature bypass |
| `VITE_API_BASE_URL` | Leave **empty** locally so the browser uses Vite’s `/api` proxy (same-origin cookies). |
| `API_PROXY_TARGET` | Vite proxy target (default `http://127.0.0.1:4000`) |
| `WEB_ORIGIN` | CORS origin (default `http://localhost:5173`) |
