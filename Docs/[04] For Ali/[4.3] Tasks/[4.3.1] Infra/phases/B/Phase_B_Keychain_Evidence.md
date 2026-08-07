# Phase B — Keychain challenge evidence (acceptance #2)

> **Owner:** Ali · **Date:** 2026-07-27  
> **Postgres:** Docker (`hive-freelance-db` on `localhost:5432`) · **API:** `http://127.0.0.1:4000`  
> **Code fix:** `apps/api/src/lib/challengeStore.ts` — wrong challenge no longer deletes a pending challenge  
> **UI fix:** `apps/web/src/pages/KeychainCheckPage.tsx` — WAX init vs raw Keychain sign reported separately

---

## Acceptance #2

Signed Keychain challenge round-trips: **challenge → Keychain Posting sign → `/auth/verify` → session cookie**.

- [x] API challenge / verify path verified (automated)
- [x] Edge cases: invalid username, unknown account, wrong challenge, bad signature, reuse
- [x] `/keychain` smoke labeling fixed (no false “WAX signed” claim)
- [ ] Human: full `/login` with real Keychain extension (fill below)

---

## Environment

| Item | Value |
|------|--------|
| Docker Postgres | `hive-freelance-db` healthy · `0.0.0.0:5432→5432` |
| `/health` | `{"ok":true,"db":"up",...}` |
| Test account (API) | `gtg` (public Hive account for challenge issuance only) |
| Username used (Keychain UI) | _fill in_ |
| Screenshot notes | _attach or describe_ |

---

## B1 — API verification results (2026-07-27)

| Check | Result |
|-------|--------|
| `GET /challenge?username=gtg` | **200** + `challenge`, `expires_in: 60` |
| `GET /challenge?username=ab` | **400** `INVALID_USERNAME` |
| `GET /challenge?username=nofounduserxx` | **404** account not found |
| `POST /verify` wrong challenge | **401** `BAD_CHALLENGE` (pending challenge **kept**) |
| `POST /verify` correct challenge + fake sig | **401** `BAD_SIGNATURE` (challenge **consumed**) |
| `POST /verify` reuse same challenge | **401** `BAD_CHALLENGE` |

Login UI path (code review): empty username, missing Keychain, and Keychain reject are handled in `LoginPage.tsx`. Production round-trip uses raw `window.hive_keychain.requestSignBuffer` (correct).

**Dev Keychain path:** `POST /api/v1/auth/dev-keychain-login` when `ENABLE_DEV_AUTH_ROUTES=true` + seeded keys — same `verifyPostingSignature` path; optional for local demos without the browser extension.

---

## B2 — `/keychain` smoke (fixed)

Before: page said “WAX + Keychain provider ready” then signed only via raw `hive_keychain`.

After:

1. **Detect Keychain** — handshake / extension detect  
2. **Check WAX init** — `createHiveChain` + `KeychainProvider.for` (status labeled WAX only)  
3. **Raw Keychain signBuffer smoke** — explicit “Raw Keychain signBuffer OK|failed”

`/login` still uses raw Keychain for the real challenge (unchanged on purpose).

---

## Human checklist — `/login` Keychain happy path

1. `docker compose up -d` (Postgres) + `npm run dev`
2. Open `http://localhost:5173/login`
3. Enter your Hive username (Keychain unlocked)
4. **Sign in with Hive Keychain** → approve Posting sign
5. Expect session + redirect to dashboard
6. Optional: `http://localhost:5173/keychain` → Detect → Check WAX init → Raw signBuffer smoke

| Edge case | How | Expected |
|-----------|-----|----------|
| No extension | Incognito / disabled | Clear error |
| Cancel popup | Reject in Keychain | Error; can retry |
| Bad username | `ab` or fake name | 400 / 404 from challenge |
| Challenge reuse | Double-submit same challenge | 401 `BAD_CHALLENGE` |

---

## Acceptance #2 status

**API + smoke code: closed.**  
**Browser Keychain screenshot:** pending Ali fill-in above.

When screenshot is attached, tick:

- [x] Acceptance #2 (API + scaffolding) closed for Phase B  
- [ ] Acceptance #2 (live Keychain UI proof) closed
