# 04 — Authentication & Roles Strategy

---

## Overview

Two authentication paths. Users with an existing Hive account use **Hive Keychain** (challenge/response). Users without one use **Google OAuth** — the platform provisions a Hive account and delegates Resource Credits on their behalf. Both paths issue the same JWT on success.

All server-side transaction signing uses `@hiveio/wax`. Browser-side Keychain signing uses `@hiveio/signers-keychain`.

---

## Role Definitions

| Role | Description |
|------|-------------|
| `client` | Posts jobs, accepts proposals, funds milestones, approves work, releases payment |
| `freelancer` | Submits proposals, delivers milestones, ratifies escrow, cooperative refunds |
| `both` | All client AND freelancer permissions. 403 enforced if same user is both client and freelancer on the same contract |



---

## Permission Matrix

| Action | Client | Freelancer | Both |
|--------|:------:|:----------:|:----:|
| Browse jobs | ✅ | ✅ | ✅ |
| Post a job | ✅ | ❌ | ✅ |
| Submit a proposal | ❌ | ✅ | ✅ |
| View proposals on own job | ✅ | ❌ | ✅ |
| Accept / reject proposal | ✅ | ❌ | ✅ |
| Create milestones | ✅ | ❌ | ✅ |
| Fund a milestone (escrow) | ✅ | ❌ | ✅ |
| Ratify escrow (`escrow_approve`) | ❌ | ✅ | ✅ |
| Submit a milestone | ❌ | ✅ | ✅ |
| Approve a milestone | ✅ | ❌ | ✅ |
| Release payment | ✅ | ❌ | ✅ |
| Cooperative refund broadcast | ❌ | ✅ | ✅ |
| Submit a review | ✅ | ✅ | ✅ |
| Initiate contract completion | ✅ | ✅ | ✅ |
| Cancel contract (pre-funding only) | ✅ | ✅ | ✅ |

---

## Authentication Flows

### Path 1 — Hive Keychain (native Hive users)

```mermaid
%%{init: {'theme': 'neutral'}}%%
sequenceDiagram
    actor User
    participant React
    participant Keychain
    participant API
    participant DB

    User->>React: enters Hive username, clicks Login
    React->>API: GET /auth/challenge?username=alice
    API->>API: generate random challenge, store with 60s TTL
    API-->>React: {challenge: "rand_xyz_123"}
    React->>Keychain: requestSignBuffer(challenge, "Posting")
    Keychain->>User: prompts to sign with Posting key
    User->>Keychain: confirms
    Keychain-->>React: signed challenge
    React->>API: POST /auth/verify {username, signature, challenge}
    API->>API: verify signature against alice's public Hive key
    API->>DB: upsert user record (first login creates the account)
    API-->>React: JWT (httpOnly cookie)
```

**Challenge TTL:** 60 seconds. Single-use — invalidated immediately after verification.

### Path 2 — Google OAuth (users without a Hive account)

```mermaid
%%{init: {'theme': 'neutral'}}%%
sequenceDiagram
    actor User
    participant React
    participant API
    participant Google as Google OAuth
    participant DB
    participant Prov as Provisioning Service
    participant HiveNode as Hive Node

    User->>React: clicks "Continue with Google"
    React->>API: GET /auth/google
    API-->>React: redirect to Google consent screen
    User->>Google: approves consent
    Google->>API: GET /auth/google/callback?code=...
    API->>Google: exchange code for token
    Google-->>API: {sub, email}

    API->>DB: lookup oauth_accounts by provider_user_id = sub
    alt Returning Google user
        API-->>React: JWT (httpOnly cookie)
    else New Google user
        API->>Prov: provision account for email
        Prov->>HiveNode: account_create op (wax, platform pays fee)
        Prov->>HiveNode: delegate_vesting_shares (RC delegation)
        Prov->>KMS: store active key reference
        Prov->>DB: insert users + oauth_accounts rows
        API-->>React: JWT (httpOnly cookie)
    end
```

> **RC delegation is mandatory.** A brand-new Hive account has ~0 Resource Credits and cannot broadcast any transaction. The provisioning service delegates RC immediately on account creation. Without this, all on-chain operations will silently fail for new users.

> **Google users are custodial by default — but claimable.** Their active key is held in the KMS and all escrow transactions are signed server-side on their behalf. They never install Keychain. However, accounts must be claimable: the user can bring their own keys and take self-custody at any time (see Claim/Hand-over Path below).

> **Custodial surface:** The KMS holds an active key for every Google-provisioned user, not just the platform agent. Apply the same rigor to this vault: per-user key isolation (separate KMS key per account), least-authority signing scope, audit logging on every use. Users must be explicitly informed in UX and ToS that the platform is custodying their keys.

---

### Claim / Hand-over Path (Google-provisioned users → self-custody)

A cross-project standard. Google-provisioned accounts are the user's — the platform holds keys custodially by default but must provide an irreversible exit to self-custody.

```mermaid
%%{init: {'theme': 'neutral'}}%%
sequenceDiagram
    actor User
    participant React
    participant API
    participant KMS
    participant HiveNode as Hive Node

    User->>React: navigates to "Claim my account"
    User->>React: provides own owner/active/posting/memo public keys
    React->>API: POST /auth/me/claim-account {owner_key, active_key, posting_key, memo_key}
    API->>KMS: retrieve custodial owner key for this user
    API->>API: construct account_update2 op rotating all keys to user's keys
    API->>HiveNode: broadcast account_update2 (signed with custodial owner key via KMS)
    HiveNode-->>API: confirmed
    API->>KMS: irreversibly delete custodial key material for this user
    API->>DB: mark user as self-custodial (auth_type = claimed)
    API-->>React: "Your account is now fully yours. Install Keychain to continue."
```

After claim, the platform cannot sign for this user. They must install Hive Keychain (or another signer) for any future on-chain actions. The `account_update2` operation uses the owner key (highest authority) to rotate all four key roles simultaneously — this is why the provisioning service must store the owner key in KMS, not just the active key.

---

### Transaction Signing (Active Key — Keychain users)

```mermaid
%%{init: {'theme': 'neutral'}}%%
sequenceDiagram
    actor User
    participant React
    participant Keychain
    participant HiveNode as Hive Node
    participant API

    User->>React: clicks "Fund Milestone"
    React->>API: POST /contracts/:id/milestones/:mid/fund (JWT)
    API-->>React: escrow params {amount, agent, escrow_id, ...}
    React->>Keychain: requestBroadcast(escrow_transfer op, "Active")
    Keychain->>User: prompts to sign with Active key
    User->>Keychain: confirms
    Keychain->>HiveNode: broadcast signed tx
    HiveNode-->>React: {tx_id: "abc123"} (via Keychain callback)
    React->>API: PATCH /payments/:id/confirm {hive_tx_id: "abc123"} (JWT)
    API-->>React: payment status updated
```

---

## JWT Structure

```json
{
  "sub":      "42",
  "username": "alice",
  "role":     "freelancer",
  "iat":      1720000000,
  "exp":      1720086400
}
```

| Field | Value | Notes |
|-------|-------|-------|
| `sub` | `users.id` | Internal DB user ID |
| `username` | `hive_username` | For display and Hive lookups |
| `role` | `client / freelancer / both` | Drives authorization middleware |
| `iat` | Unix timestamp | Issued at |
| `exp` | `iat + 24h` | 24-hour session for all roles |

**Storage:** `httpOnly`, `Secure`, `SameSite=Strict` cookie — not `localStorage`.

---

## Authorization Implementation

### Middleware chain

```
POST /milestones/:id/approve
  → authMiddleware       (valid JWT? → populate req.user)
  → roleGuard(['client','both'])
  → ownershipCheck       (is this their contract?)
  → handler
```

### Ownership checks

| Endpoint | Check |
|----------|-------|
| `PUT /jobs/:id` | `job.client_id === req.user.id` |
| `POST /proposals/:id/accept` | `job.client_id === req.user.id` |
| `POST /milestones/:id/approve` | `contract.client_id === req.user.id` |
| `POST /milestones/:id/submit` | `contract.freelancer_id === req.user.id` |
| `POST /payments/:id/ratify` | `contract.freelancer_id === req.user.id` |
| `GET /jobs/:id/proposals` | `job.client_id === req.user.id` |
| `GET /contracts/:id` | `contract.client_id === req.user.id OR contract.freelancer_id === req.user.id` |

---

## Key Type Reference — All On-Chain Operations

| Operation | Hive Op | Key | Broadcaster |
|-----------|---------|-----|-------------|
| Fund milestone | `escrow_transfer` | Active | Keychain user / KMS (Google user, via wax) |
| Ratify escrow | `escrow_approve` | Active | Keychain user / KMS (Google user, via wax) |
| Agent auto-ratify | `escrow_approve` | Active | Agent backend (wax + KMS) |
| Release payment | `escrow_release` | Active | Keychain user / KMS (Google user, via wax) |
| Cooperative refund | `escrow_release` | Active | Freelancer Keychain / KMS |
| Create contract | `custom_json` | **Posting** | Keychain user / KMS (Google user, via wax) |
| Approve milestone | `custom_json` | **Posting** | Keychain user / KMS (Google user, via wax) |
| Submit review | `custom_json` | **Posting** | Either party / KMS |
| Provision account | `account_create` | Active | Provisioning service (wax + KMS) |
| Delegate RC | `delegate_vesting_shares` | Active | Provisioning service (wax + KMS) |
| Raise dispute | `escrow_dispute` | Active | Keychain user / KMS (Google user, via wax) |
| Admin resolve dispute | `escrow_release` | Active | Agent backend (wax + KMS), authorized team member |
| Claim account | `account_update2` | **Owner** | Platform KMS (custodial owner key) — rotates all keys to user's keys then wipes KMS copies |

> Active key is used only for operations that move or control funds and for provisioning. Using Active key for `custom_json` operations (approval, review) is wrong for Keychain users — it needlessly exposes the higher-privilege key.