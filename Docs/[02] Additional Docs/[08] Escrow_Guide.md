# Escrow Guide (MVP)

How Hive Freelance uses **native Hive escrow** for the internship MVP: fund → agent + freelancer ratify → work → release, plus **cooperative refund**. Disputes stay Phase 2.

Source of truth for design: [`Docs/[03] System_Architecture_Data_Model/[05] Escrow_Integration.md`](../[03]%20System_Architecture_Data_Model/[05]%20Escrow_Integration.md).

## Happy path

1. **Fund (client)** — `POST /api/v1/contracts/:id/milestones/:mid/fund` returns an `escrow_transfer` payload (`escrow_id` from SHA256 truncate, **24h** ratification deadline, expiration = contract end + **30 days**, default **HBD**, `json_meta.app`).
2. Client signs with Keychain Active (`requestBroadcast`) or custodial `/payments/:id/custodial-sign`, then `PATCH /payments/:id/confirm`.
3. API sets payment `awaiting_ratification` and runs **agent auto-`escrow_approve`** (`apps/api/src/services/agentEscrow.ts`).
4. **Ratify (freelancer)** — `POST /payments/:id/ratify` → broadcast `escrow_approve` → `PATCH .../ratify/confirm` (stores `freelancer_approve_tx_id`).
5. **Listener** at LIB requires **both** agent and freelancer approves → `escrowed` + milestone `funded`.
6. After milestone approve off-chain, **Release (client)** — `escrow_release` to freelancer. Terminal `released` is set by the **listener at LIB** by default.
7. **Cooperative refund (freelancer)** — `escrow_release` with `receiver` = client; listener sets `refunded` at LIB.

UI: `/contracts` and `/contracts/:id` (Fund / Ratify / Release / Refund).

## State machine (payments)

| Status | Meaning |
|--------|---------|
| `pending` | Fund payload issued or reset for re-fund |
| `awaiting_ratification` | `escrow_transfer` confirmed; waiting for both approves |
| `escrowed` | Both approves at LIB (or dry-demo shortcut) |
| `released` | Funds to freelancer (LIB) |
| `refunded` | Back to client / missed ratification closed |
| `disputed` | Phase 2 |

Missed ratification (deadline passed without both approves): listener closes the row as `refunded` and leaves the milestone re-fundable.

## Env flags

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENT_ACCOUNT` | `hive-freelance-agent` | Platform agent on escrow ops |
| `AGENT_LIVE` | `false` | When `true`, agent approve uses live KMS/broadcast path |
| `CUSTODIAL_LIVE` | `false` | When `true`, Google custodial sign broadcasts |
| `ESCROW_TRUST_CLIENT_CONFIRM` | `false` | When `true`, release/refund confirm sets terminal status without waiting for listener (demos only) |
| `ESCROW_DRY_DEMO` | `false` | When `true`, after freelancer ratify confirm + agent dry-run approve ref, promote to `escrowed` without chain LIB |
| `RC_WARNING_PCT` | `5` | Keychain login warns if account RC % is below this |
| `APP_ID` | `hive-freelance-v1` | Must match `json_meta.app` / listener filter |

## RC warning

On Keychain `POST /auth/verify`, the API may return `rc_warning` if `rc_api.find_rc_accounts` reports low mana. The login page surfaces it; MVP does not require a live RC delegation pool — treat it as “ask platform to delegate.”

## Phase 2 (out of scope)

- `escrow_dispute` / admin `escrow_release` allowlist
- Live dispute UI (API remains **501**)
- Production AWS/GCP KMS
- HAF replacing the custom listener

## Local dry loop

1. Set `ESCROW_DRY_DEMO=true` (and keep `AGENT_LIVE`/`CUSTODIAL_LIVE` false) for UI demos without waiting on chain.
2. Or use Keychain on testnet + run the listener so LIB sync promotes `escrowed` / `released`.
3. Apply migration `003_escrow_hardening.sql` (`npm run migrate -w @hive-freelance/db`).
