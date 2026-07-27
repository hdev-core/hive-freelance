# Milestone 1 — Hive Layer Foundation: Work Plan

> **Owner:** Ali · **Folder:** `Docs/[04] For Ali/[4.3] Tasks`  
> **Created:** 2026-07-27  
> **Source of truth:** Roadmap Milestone 1 (architecture card feedback 08 Jul, point 1)  
> **Refs:** `Docs/[03]/.../[01] Tech_Stack.md` · `[05] Escrow_Integration.md`

---

## 1. What this milestone is (plain language)

Build the **shared Hive plumbing** that every later feature (auth, escrow, jobs) will reuse.

It is **not** marketplace feature logic (jobs, proposals, disputes UI).

You need four foundation pieces:

| Piece | Plain meaning |
|-------|----------------|
| **WAX** | Official toolkit to **build and sign** Hive transactions (`custom_json`, escrow ops). **Not** `@hiveio/dhive`. |
| **HAF** | Official way to **read/index** chain data into PostgreSQL. **Not** a permanent hand-rolled block listener + cache. |
| **Keychain challenge** | Prove “this browser user owns Hive account X” with a sign-in round-trip. |
| **RC delegation stub** | When provisioning a new account, prepare (or dry-run) giving it Resource Credits so it can broadcast later. |

---

## 2. Official acceptance criteria

You are **done** only when all of these are true:

1. App can **read a Hive account / on-chain records via HAF** (SQL over HAF projection, not only `hive_records` from the custom listener).
2. A **signed Keychain challenge** round-trips (challenge → Keychain sign → API verify → session).
3. A **WAX-built `custom_json` op** broadcasts on **testnet** or a clear **mock** with evidence.
4. **Deps:** backend scaffold is in place (already largely true).

**Out of scope for this milestone:** escrow happy-path UI polish, disputes, production AWS/GCP KMS, full marketplace features.

---

## 3. Current code vs requirement (honest gap)

| Requirement | Status in code today | Gap |
|-------------|----------------------|-----|
| WAX as tx library (no dhive) | **Partial** — `@hiveio/wax` installed; `createChain` inits WAX; many reads still condenser RPC; broadcasts often Keychain/dry-run, not full WAX tx builder path | Finish WAX build + broadcast/mock demo |
| HAF for read/index | **Missing** — `apps/listener` + `hive_records` is the hand-rolled path; comments still say “Phase 2 HAF” | Introduce HAF read path; retire listener as *source of truth* for M1 acceptance |
| Keychain challenge scaffolding | **Mostly done** — `/auth/challenge` + `/auth/verify` + Login/Keychain pages | Document proof + fix any broken smoke path |
| RC-delegation-on-provisioning stub | **Mostly done** — `apps/provisioner` `delegateRc()` dry-run / live flag | Keep stub; prove dry-run in demo notes |
| Backend scaffold | **Done** | — |

---

## 4. How you should work (rules)

1. **One acceptance item at a time** — finish and demo before starting the next.
2. **Foundation only** — if a change is only for jobs/escrow UX, park it for a later milestone.
3. **Prove with evidence** — screenshot, curl output, or log snippet for each acceptance checkbox.
4. **Docs follow the task card** — HAF + WAX are the standard; custom listener is interim/legacy until HAF reads work.
5. **Ask early on HAF infra** — full HAF (own hived + sql_serializer) is heavy; confirm with Laure whether **local/docker HAF**, **shared Greateck HAF**, or **HAF-compatible SQL schema + adapter** counts for internship acceptance.

---

## 5. Task-based plan (do in order)

### Phase A — Align & spike (½–1 day)

> **A1 / A2 / A3 done** → see [`[02] Phase_A_M1_Brief.md`](./[02]%20Phase_A_M1_Brief.md) · [`[03] Phase_A_HAF_Decision.md`](./[03]%20Phase_A_HAF_Decision.md) · [`[04] Phase_A_Hive_Inventory.md`](./[04]%20Phase_A_Hive_Inventory.md)  
> HAF path: working assumption recorded; **Laure sign-off still pending** in `[03]`.

| ID | Task | Done when | Status |
|----|------|-----------|--------|
| **A1** | Re-read task card + `Tech_Stack.md` (updated to WAX+HAF) | You can explain M1 in 2 minutes without feature talk | Done → `[02]` |
| **A2** | Confirm HAF setup path with lead (local vs shared vs adapter) | Written decision in this folder or chat note | Decision written → `[03]` (pending Laure) |
| **A3** | Inventory existing Hive files | Short list: keep / change / replace (see §6) | Done → `[04]` |

### Phase B — Keychain challenge (close acceptance #2) (~0.5 day)

> **B1 / B2 / B3 done✅** → see [`[05] Phase_B_Keychain_Evidence.md`](./[05]%20Phase_B_Keychain_Evidence.md)  
> API challenge/verify + edge cases verified (Postgres via Docker). KeychainCheck dual-status fixed. Live Keychain UI screenshot: fill in `[05]`.

| ID | Task | Files / area | Done when | Status |
|----|------|--------------|-----------|--------|
| **B1** | Verify challenge round-trip works end-to-end | `apps/api` auth routes + `hiveAuth.ts`; `apps/web` Login / KeychainCheck | Challenge → sign → verify → cookie | done✅ |
| **B2** | Fix any broken smoke (WAX Keychain provider vs raw `hive_keychain`) | `KeychainCheckPage.tsx`, `LoginPage.tsx` | `/keychain` and `/login` both succeed | done✅ |
| **B3** | Capture acceptance evidence | Screenshot + username used | Checkbox #2 closed | done✅ |

### Phase C — WAX build + `custom_json` broadcast/mock (close acceptance #3) (~1–2 days)

| ID | Task | Files / area | Done when |
|----|------|--------------|-----------|
| **C1** | Add a small shared helper: build `custom_json` with **WAX** (not hand-shaped JSON only) | Prefer `packages/hive` (e.g. new `waxTx.ts` / extend `chain.ts`) | One function returns a WAX-built op/tx |
| **C2** | Wire broadcast **or** documented mock | Testnet broadcast **or** mock returning `hive_tx_id` + dry-run flag | Logs show WAX path used |
| **C3** | Expose a tiny demo endpoint or script | e.g. `POST /api/v1/health/wax-custom-json-demo` (dev-only) or `npm` script | Curl/UI triggers it |
| **C4** | Capture acceptance evidence | Tx id / mock id + code path note | Checkbox #3 closed |

**Do not** use `@hiveio/dhive` anywhere. Prefer `@hiveio/wax` + `@hiveio/wax-signers-keychain` in browser.

### Phase D — HAF read path (close acceptance #1) (~2–4 days, depends on A2)

| ID | Task | Files / area | Done when |
|----|------|--------------|-----------|
| **D1** | Set up or connect to HAF PostgreSQL projection (per A2 decision) | Infra / compose / env | Can `SELECT` HAF account/op tables |
| **D2** | Add `packages/hive` (or `packages/db`) **HAF reader** module | New module e.g. `haf.ts` | `getAccount` / recent ops via SQL |
| **D3** | Expose API read: Hive account + sample records **from HAF** | `apps/api` health or `/hive/accounts/:name` | Response sourced from HAF, not condenser-only |
| **D4** | Document how M1 apps should read chain data | Update Local Dev + this plan’s “Done definition” | Team knows: **reads → HAF** |
| **D5** | Demote custom listener for M1 acceptance | Keep listener only if still needed for escrow sync interim; **acceptance reads must be HAF** | Checkbox #1 closed |

> If full HAF infra is blocked: land an **adapter interface** (`HiveReadStore`) with a HAF implementation stub + SQL schema notes, and escalate — but the **task card requires HAF**, so do not mark M1 complete on listener-only reads.

### Phase E — RC delegation stub (confirm, don’t expand) (~0.5 day)

| ID | Task | Files / area | Done when |
|----|------|--------------|-----------|
| **E1** | Confirm `delegateRc` dry-run path | `apps/provisioner` | Log line with dry-run message |
| **E2** | Env flags documented | `.env.example` `PROVISIONER_LIVE`, `HIVE_RC_DELEGATION_VESTS` | Matches Auth/Local guides |
| **E3** | Note in evidence pack | “RC stub: dry-run by default” | M1 scope respected (stub, not live pool) |

### Phase F — Docs, cleanup, handoff (~0.5–1 day)

| ID | Task | Done when |
|----|------|-----------|
| **F1** | Tech stack / architecture docs say **WAX + HAF** as M1 standard | No “HAF only Phase 2” as if M1 ignores HAF |
| **F2** | Short demo script in this Tasks folder (or Additional Docs) | Another teammate can reproduce acceptance in &lt;15 min |
| **F3** | Self-check against §2 acceptance | All three checkboxes + scaffold |

---

## 6. File map — what to touch vs leave alone

### Prefer changing (Hive layer)

```text
packages/hive/src/          ← WAX helpers, HAF reader, exports
packages/shared/src/        ← APP_ID / op type constants only if needed
apps/api/src/lib/hiveAuth.ts
apps/api/src/routes/auth.ts
apps/api/src/routes/health.ts   ← optional demo endpoints
apps/web/src/pages/KeychainCheckPage.tsx
apps/web/src/lib/keychain.ts
apps/provisioner/src/index.ts   ← RC stub only
.env.example
Docs/[03]/[01] Tech_Stack.md
Docs/[04] For Ali/...           ← your notes + this plan
```

### Treat as interim / do not grow for M1

```text
apps/listener/              ← hand-rolled; not the M1 acceptance read path
apps/api/src/services/payments.ts   ← escrow feature logic (later)
apps/web/src/pages/ContractPage.tsx ← escrow UI (later)
```

---

## 7. Suggested daily order

```text
Day 1:  A1–A3, B1–B3          → Keychain acceptance closed
Day 2:  C1–C4                 → WAX custom_json acceptance closed
Day 3+: D1–D5 (HAF)           → HAF read acceptance closed
Half day: E1–E3, F1–F3        → RC stub + docs + evidence pack
```

Adjust Day 3+ after A2 (HAF infra reality).

---

## 8. Definition of done (copy for PR / card)

- [ ] No `@hiveio/dhive` in dependencies or imports.
- [ ] WAX used to build at least one `custom_json` (broadcast or mock) — evidence attached.
- [x] Keychain challenge round-trip works — evidence attached. → [`[05] Phase_B_Keychain_Evidence.md`](./[05]%20Phase_B_Keychain_Evidence.md)
- [ ] App reads Hive account/records **via HAF** — evidence attached (SQL/API response).
- [ ] RC-delegation-on-provisioning remains a **stub** (dry-run default) — noted.
- [ ] Docs updated so M1 standard is **WAX + HAF**, not “listener forever.”
- [ ] This work stays **shared Hive layer**, not new feature logic.

---

## 9. Risks & escalations

| Risk | Mitigation |
|------|------------|
| Full HAF (hived replay) too heavy for internship laptop | Confirm shared HAF / docker slice / minimal projection with Laure early (A2) |
| Public Hive has no easy public testnet | Use documented mock **or** carefully scoped test account; note in evidence |
| Escrow UI already exists | Do not expand it for M1; only reuse if needed to show WAX/Keychain |
| Listener still used by escrow sync | Allowed as interim; **do not** claim HAF acceptance through `hive_records` alone |

---

## 10. One-line status template (standup)

> “M1 Hive layer: Keychain [ ] / WAX custom_json [ ] / HAF reads [ ] / RC stub [x] — blocker: ___.”

---

## 11. How to test (step-by-step)

Do these in order after each phase. Save evidence (screenshot / terminal paste) in this folder or attach to the card.

### 11.0 Pre-flight — stack is up

```bash
# Terminal 1 — Postgres only
docker compose up -d

# Terminal 2 — install + migrate if needed
npm install
npm run migrate -w @hive-freelance/db

# Terminal 3 — API + web + interim listener
npm run dev
```

| Check | How | Pass looks like |
|-------|-----|-----------------|
| Postgres | `docker compose ps` | `hive-freelance-db` healthy / up |
| API | Browser or curl `http://localhost:4000/health` | `ok` / db connected |
| Web | `http://localhost:5173` | Home page loads |
| Hive node | `http://localhost:4000/api/v1/health/hive` (or equivalent) | head + LIB numbers present |
| No dhive | `npm ls @hiveio/dhive` from repo root | empty / not found |

If API/web fail: confirm `.env` has `DATABASE_URL=postgresql://hive:hive@localhost:5432/hive_freelance` and ports 4000/5173 are free.

---

### 11.1 Test Keychain challenge (acceptance #2)

**Happy path**

1. Install Hive Keychain browser extension; unlock it.
2. Open `http://localhost:5173/keychain` → Detect → Sign smoke (optional).
3. Open `http://localhost:5173/login`.
4. Enter a **real** Hive username you control in Keychain.
5. Click **Login with Keychain** → approve Posting sign in the popup.
6. Expect redirect / session (`/jobs` or signed-in state).

**API-only check (optional)**

```text
GET  /api/v1/auth/challenge?username=YOUR_HIVE_USER
POST /api/v1/auth/verify   { username, challenge, signature, role? }
GET  /api/v1/auth/me       (with cookie)
```

| Result | Meaning |
|--------|---------|
| 200 + `hf_token` cookie | Pass |
| 404 account not found | Username wrong / not on chain |
| 401 BAD_CHALLENGE | Challenge expired or reused |
| 401 BAD_SIGNATURE | Wrong key / cancelled Keychain / bad sig |

**Evidence:** screenshot of Keychain approve + logged-in UI + optional Network tab of `/verify` 200.

---

### 11.2 Test WAX `custom_json` (acceptance #3)

After Phase C exists (demo endpoint or npm script):

**Mock mode (default for local)**

1. Call the demo endpoint/script with mock/dry-run flag.
2. Confirm response includes something like `dryRun: true` and a synthetic `hive_tx_id`.
3. Confirm server log mentions **WAX** build path (not only hand-built JSON).

**Broadcast mode (only if lead approved test account)**

1. Set the documented live/test flag (do **not** invent mainnet spend without approval).
2. Run once; capture real `hive_tx_id`.
3. Optionally look up tx on a Hive explorer.

**Evidence:** response JSON + log line proving WAX builder was used.

---

### 11.3 Test HAF reads (acceptance #1)

After Phase D:

1. Confirm HAF DB is reachable (same Postgres or separate URL — per A2).
2. Run a raw SQL sample (table names depend on your HAF setup), e.g. account lookup for a known name.
3. Hit the M1 API read route (e.g. `/api/v1/hive/accounts/:name` or health HAF probe).
4. Confirm the response is labeled / implemented as **HAF-backed**, not condenser-only and not `hive_records`-only.

| Fail | Likely cause |
|------|----------------|
| Connection refused | HAF/Postgres URL wrong; Docker not up |
| Empty account | Name typo; HAF not synced that far |
| Data only in `hive_records` | You are still on interim listener — **does not pass M1** |

**Evidence:** SQL result + API JSON for the same account.

---

### 11.4 Test RC delegation stub (E)

1. Keep `PROVISIONER_LIVE=false` (default).
2. Trigger Google provision path used locally (e.g. `POST /api/v1/auth/dev-google` if available).
3. API/provisioner log should show dry-run `delegate_vesting_shares` / RC message.
4. Confirm **no** unexpected mainnet broadcast.

**Evidence:** log snippet with `dry-run`.

---

### 11.5 Full “everything is working” checklist (run before demo)

Use this as your final gate. Tick only if you personally verified.

#### Environment always healthy

- [ ] `docker compose up -d` → Postgres up
- [ ] `npm run migrate -w @hive-freelance/db` → migrations applied / skipped cleanly
- [ ] `npm run dev` → api + web (+ listener) start without crash loops
- [ ] `/health` OK
- [ ] Hive health shows head + LIB (or HAF sync status if that replaces it)
- [ ] `.env` present (not only `.env.example`); secrets not committed

#### Milestone 1 acceptance always demonstrable

- [ ] Keychain challenge round-trip works on a clean browser session
- [ ] Challenge cannot be reused (second verify with same challenge fails)
- [ ] WAX `custom_json` mock **or** broadcast works once
- [ ] HAF account/records read works once and is clearly HAF-sourced
- [ ] RC stub dry-runs by default
- [ ] `npm ls @hiveio/dhive` shows not installed

#### Regression smoke (don’t break scaffold)

- [ ] Home page still loads
- [ ] `/login` still reachable
- [ ] API still serves `/api/v1/...` behind Vite proxy when using empty `VITE_API_BASE_URL`

#### Out of scope — do **not** block M1 on these

- [ ] ~~Production AWS/GCP KMS~~ (local KMS stub only for M1)
- [ ] ~~Full escrow Fund→Release demo~~ (feature milestone)
- [ ] ~~Disputes UI~~ (501 / Phase 2)

> Note: If someone said “check AWS” meaning **Amazon Web Services**: production KMS on AWS is **out of M1**. For M1, verify the **local** signer stub (`KMS_MODE=local`) and dry-run flags only.

---

## 12. Edge cases to cover (build + test)

Treat these as required tests for M1 quality, not optional polish.

### 12.1 Keychain / auth edge cases

| ID | Edge case | Expected behavior | How to test |
|----|-----------|-------------------|-------------|
| **KC-1** | Keychain extension missing | Clear UI error; no crash | Disable extension / Incognito without it |
| **KC-2** | User cancels Keychain popup | Error message; can retry | Start login → Reject |
| **KC-3** | Unknown Hive username | 404 from `/challenge` | Typo username |
| **KC-4** | Expired / reused challenge | 401 BAD_CHALLENGE | Call `/verify` twice with same challenge |
| **KC-5** | Wrong account signs buffer | 401 BAD_SIGNATURE | Sign as B while challenge was for A (if Keychain allows) |
| **KC-6** | Empty username | 400 client/API validation | Submit blank |
| **KC-7** | Low RC warning path | Optional `rc_warning` on verify; login still succeeds | Account with low RC, or mock threshold |
| **KC-8** | Cookie / SameSite session | `/auth/me` works via Vite proxy same-origin | Login then refresh `/jobs` |

### 12.2 WAX / `custom_json` edge cases

| ID | Edge case | Expected behavior | How to test |
|----|-----------|-------------------|-------------|
| **WX-1** | WAX WASM init fails | Fallback or clear error; no silent dhive | Break API node / force init fail in dev once |
| **WX-2** | Mock mode always safe | Never broadcasts when dry-run/mock | Confirm no chain tx with flags off |
| **WX-3** | Live flag without keys | Hard fail with clear message | `LIVE=true` without key material |
| **WX-4** | Invalid `custom_json` id / body | Validation error before broadcast | Send empty json / wrong id |
| **WX-5** | Idempotent demo spam | No crash if called repeatedly | Hit demo endpoint 5× |

### 12.3 HAF read edge cases

| ID | Edge case | Expected behavior | How to test |
|----|-----------|-------------------|-------------|
| **HF-1** | HAF DB down | 503/error with clear message; API process stays up | Stop HAF DB container |
| **HF-2** | Account not in projection | 404 / empty documented shape | Query random name |
| **HF-3** | SQL injection style input | Parameterized query; no crash | Username `a'; drop table--` |
| **HF-4** | Confusing listener vs HAF | Response metadata or docs prove source is HAF | Compare `hive_records` vs HAF API for same query |
| **HF-5** | Stale / sync lag | Document expected lag; don’t claim LIB if not synced | Note in demo script |

### 12.4 RC stub / provisioner edge cases

| ID | Edge case | Expected behavior | How to test |
|----|-----------|-------------------|-------------|
| **RC-1** | `PROVISIONER_LIVE=false` | Dry-run only; account mapping still saved if design says so | Dev Google login |
| **RC-2** | `PROVISIONER_LIVE=true` without creator key | Explicit error; no partial silent success | Toggle flag wrongly |
| **RC-3** | RC delegation failure after account create | Account not orphaned; warning returned/logged | Force RC fail in stub |

### 12.5 Environment / ops edge cases

| ID | Edge case | Expected behavior | How to test |
|----|-----------|-------------------|-------------|
| **OP-1** | Missing `DATABASE_URL` | Migrate/API fail fast with clear error | Unset env briefly |
| **OP-2** | Postgres not started | Health shows db down | `docker compose stop` then hit `/health` |
| **OP-3** | Port 4000 already in use | Dev script fails clearly | Second `npm run dev` |
| **OP-4** | Wrong `HIVE_API_NODE` | Health/Hive calls fail gracefully | Point to invalid URL |

### 12.6 Edge-case tasks to add to your build (checklist)

When implementing Phases B–E, explicitly handle:

- [ ] **B:** KC-1 … KC-8 covered or documented “won’t support”
- [ ] **C:** WX-1 … WX-5
- [ ] **D:** HF-1 … HF-5
- [ ] **E:** RC-1 … RC-3
- [ ] **F:** OP-1 … OP-4 smoke in demo script

---

## 13. Suggested automated / semi-automated tests (nice to have)

If time allows (not required to start coding):

| Test | Tool idea | Covers |
|------|-----------|--------|
| Challenge consume once | API integration test | KC-4 |
| Verify rejects bad signature | API test with garbage sig | KC-5 |
| HAF reader returns 404 for missing | Unit/integration with test DB | HF-2 |
| WAX mock never needs network | Unit test of builder + mock | WX-2 |
| No dhive in lockfile | CI grep / `npm ls` | Acceptance |

Manual Keychain UI still needs a human (browser extension).

---

## 14. Demo day script (15 minutes)

1. Show `/health` + Hive/HAF health (stack up).
2. Keychain login happy path (11.1) + one edge: cancel popup (KC-2).
3. WAX `custom_json` mock (11.2) + show log.
4. HAF account read (11.3) + say out loud: “this is HAF, not the custom listener.”
5. RC dry-run log (11.4).
6. Show §8 definition of done checkboxes + evidence folder.

If any step fails, use §11.5 to isolate env vs feature before the meeting.
