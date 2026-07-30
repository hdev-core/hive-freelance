# Hive Freelance

Hive-based freelance marketplace (Upwork-style) with on-chain escrow. Internship / demo project.

Stack decisions live in [`Docs/[03] System_Architecture_Data_Model/[01] Tech_Stack.md`](Docs/[03]%20System_Architecture_Data_Model/[01]%20Tech_Stack.md).

**Live frontend:** https://hive-freelance.vercel.app/ (API not deployed yet — see [`DEPLOYMENT.md`](DEPLOYMENT.md) §4)

## Stack map

| Layer | Package / app |
|-------|----------------|
| Frontend | `apps/web` — React + TypeScript (Vite), `@hiveio/wax-signers-keychain` |
| API | `apps/api` — Node.js + Express + TypeScript |
| Block listener (interim) | `apps/listener` — custom stream → `hive_records` (**M1 reads: HAF**, not this alone) |
| Provisioning | `apps/provisioner` — account_create + RC delegation stubs |
| Shared constants | `packages/shared` |
| PostgreSQL access | `packages/db` |
| Hive / WAX / HAF reader + KMS stub | `packages/hive` (`@hiveio/wax`, HAF SQL via `HAF_DATABASE_URL`, no dhive) |

## Prerequisites

- Node.js 20+
- Docker (for local Postgres)

## Quick start

```bash
# 1. Env
cp .env.example .env

# 2. Database
docker compose up -d
npm install
npm run db:migrate

# 3. Run API + web + listener
npm run dev
```

- Web: http://localhost:5173  
- API health: http://localhost:4000/health  
- Hive health: http://localhost:4000/api/v1/health/hive  
- Keychain smoke UI: http://localhost:5173/keychain  
- Login / jobs smoke UI: http://localhost:5173/login · http://localhost:5173/jobs  

API MVP details: [`Docs/[02] Additional Docs/[06] API_MVP_Guide.md`](Docs/[02]%20Additional%20Docs/[06]%20API_MVP_Guide.md).  
Auth (Keychain / Google / claim): [`Docs/[02] Additional Docs/[07] Auth_Guide.md`](Docs/[02]%20Additional%20Docs/[07]%20Auth_Guide.md).

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | API + web + listener |
| `npm run dev:api` | API only |
| `npm run db:migrate` | Apply SQL migrations (`001` bootstrap + `002` marketplace schema) |
| `npm run build` | Build all workspaces |

## Secrets

- Never commit `.env` or real Hive active keys.
- `KMS_MODE=local` uses env-backed stubs (`LOCAL_AGENT_ACTIVE_KEY`, etc.).
- Production must use KMS/HSM for the agent account and custodial Google-user keys (see architecture docs).

## Hosting

`render.yaml` sketches API, static web, listener worker, and Postgres for Render’s free tier. Railway works similarly with the same Node processes.
