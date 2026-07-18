# Freelance — Deployment & Infrastructure Guide

Infra reference for **hive-freelance** (Hive freelance marketplace, React+TS Vite monorepo).
If you're wondering *"where does my code run"* or *"why can't I deploy X"* — start here.

**Your team & who owns which infra piece**
- **Ali Sweid** — scaffold + Hive integration layer (`@hiveio/wax`, listener/provisioner).
- **Laure Mohsen** — PostgreSQL + Prisma (§3) + backend user models / role-based auth.
- **Leen Harfoush** — frontend/UI foundation + Keychain challenge-response auth (§2).

---

## 1. Your stack

| Layer | What you use | Where it runs |
|-------|--------------|---------------|
| Frontend | `apps/web` — React + TS (Vite) | **Vercel** (root dir `apps/web`) |
| Database | Postgres via **Prisma** (`packages/db`) | **Supabase** |
| API | `apps/api` — Node + Express | **always-on** → local now, Render/Hetzner later |
| Block listener | `apps/listener` (→ `hive_records`) | **always-on** → local now, Hetzner later |
| Provisioning | `apps/provisioner` | **always-on** → local now, Hetzner later |
| Auth | Keychain + custodial Google provisioner | Hive-native, **not** Supabase Auth |

You are a **full-stack** project: `apps/api` + `apps/listener` are persistent processes that
**cannot** run on Vercel (serverless). See §4.

---

## 2. "I can't deploy / connect X" — how access works

Connecting Supabase / Vercel / Render to a repo in the **`hdev-core`** org needs an **org owner
(Dr. Mohammad)** to authorize that service's GitHub app — interns can't self-authorize. To request:
comment on your DevOps card naming the **service** and that it's scoped to **hive-freelance only**.
He approves it scoped to this one repo. **Tip:** the Vercel *Actions* method (§3A) needs no org app.

---

## 3. Frontend → Vercel

**A) GitHub Actions + token (recommended, self-serve).** Create a Vercel project, set **Root
Directory = `apps/web`**, add repo secrets `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`,
add `deploy.yml` + `preview.yml` (see `HOSTING_GUIDE.md`). Push to `main` → auto-deploy; each PR → preview URL.
**B)** Or have the owner authorize the Vercel app (scoped to the repo) and import it in Vercel.

## 3b. Database → Supabase + Prisma  *(Laure)*

1. Request the Supabase app scoped to **hive-freelance** (§2).
2. Two connection strings — the #1 gotcha:
   - `DATABASE_URL` — pooled, port **6543**, add **`?pgbouncer=true`** (runtime).
   - `DIRECT_URL` — direct, port **5432** (Prisma **migrations**).
   Both in `.env` (**never commit**); in `schema.prisma`: `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`.
3. Supabase = DB/storage only. Auth stays Hive-native; canonical records go **on-chain**.

---

## 4. Your always-on services (API, listener, provisioner)

`apps/api`, `apps/listener`, `apps/provisioner` are persistent — Vercel/Supabase can't host them.
- **While building:** run locally — `docker compose up` + `npm run dev`. You do **not** need to
  deploy them to keep progressing.
- **For a live demo:** **Render** (API as a web service, listener as a **background worker** —
  free tier spins down) or, preferred for 24/7, **our Hetzner box**. Request when you're ready.

---

## 5. Branch / PR / deploy flow

`feature/* → PR → develop → PR → main → auto-deploys`. Never push straight to `main`/`develop`.
Open a PR; **Dr. Mohammad reviews & merges**. Comment on your card + link the PR when you move it.

## 6. Secrets hygiene
Never commit `.env`, tokens, or DB strings. `.gitignore` `.env` + `.vercel`. CI secrets → GitHub repo secrets.
