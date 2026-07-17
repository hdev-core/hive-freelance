# Technology Stack Explained

This document explains each component of the technology stack used for the Hive Escrow Platform and why it was chosen.

---

# System Overview

The application consists of several layers that work together:

```text
                 User
                  │
                  ▼
         React Frontend (TypeScript)
                  │
                  ▼
       Node.js Backend (Express)
                  │
      ┌───────────┼─────────────┐
      ▼           ▼             ▼
 PostgreSQL   Hive Blockchain   KMS
 Database        (WAX)       Secure Keys
```

Each layer has a specific responsibility.

---

# 1. Frontend

**Technology:** React + TypeScript

The frontend is the web application users interact with.

It provides:

- Login page
- Dashboard
- Escrow creation forms
- Escrow approval interface
- Transaction history

## Why React?

React is the industry standard for building interactive web applications. It provides reusable UI components and integrates well with JavaScript/TypeScript.

## Why TypeScript?

TypeScript adds static typing to JavaScript, reducing bugs and making large applications easier to maintain.

---

## Hive Keychain Integration

Native Hive users already own their Hive accounts and private keys.

The platform should never receive those private keys.

Instead, transactions are signed using the Hive Keychain browser extension.

Flow:

```text
User
   │
Clicks "Approve"
   │
Website requests signature
   │
Hive Keychain
   │
User confirms
   │
Transaction signed locally
   │
Hive Blockchain
```

The frontend communicates with Hive Keychain using:

- `@hiveio/signers-keychain`

---

## Google OAuth Users

Google users do not own Hive accounts initially.

Instead, they authenticate using Google.

Flow:

```text
Google Login
      │
Backend creates Hive account
      │
Keys stored securely
      │
Backend signs transactions
```

These are called **custodial users**, because the platform temporarily manages their Hive keys.

---

# 2. Backend

**Technology:** Node.js + Express

The backend contains the application's business logic.

Responsibilities include:

- User authentication
- Escrow validation
- Blockchain transaction creation
- Database updates
- Communication with Hive

Example flow:

```text
User creates escrow
        │
        ▼
Backend validates request
        │
Creates Hive transaction
        │
Returns confirmation
```

## Why Node.js?

Node.js uses JavaScript, matching the frontend ecosystem and allowing code sharing.

## Why Express?

Express is a lightweight web framework for building REST APIs.

---

# 3. Database

**Technology:** PostgreSQL

Although Hive stores blockchain transactions, the application still requires its own database.

The database stores:

- User accounts
- Login sessions
- Escrow metadata
- Cached blockchain operations
- Notifications

---

## Why PostgreSQL?

Escrow data contains many relationships:

```text
Users
   │
Escrows
   │
Approvals
   │
Transactions
```

PostgreSQL provides:

- Foreign key constraints
- ACID transactions
- Strong relational integrity
- Excellent performance

---

## JSONB

Hive operations are naturally represented as JSON.

Instead of creating dozens of columns, some blockchain operations can be stored directly inside PostgreSQL using JSONB.

Example:

```json
{
  "sender": "alice",
  "receiver": "bob",
  "amount": "50.000 HIVE",
  "memo": "Payment"
}
```

---

# 4. Blockchain Transactions

**Technology:** `@hiveio/wax`

WAX is the official Hive SDK responsible for creating and broadcasting blockchain transactions.

Instead of manually building protocol messages, developers call library functions.

Example:

```javascript
wax.broadcast(...)
```

The library handles serialization and communication with Hive nodes.

---

## Why WAX?

WAX is:

- Official Hive SDK
- Protocol-compatible
- Object-oriented
- Successor to `dhive`

---

# 5. Blockchain Reading

Broadcasting transactions is only half of the problem.

The application must also monitor the blockchain for new events.

Examples include:

- Escrow created
- Escrow approved
- Escrow released
- Escrow disputed

---

## MVP Approach

Initially, the platform uses a custom blockchain listener.

Flow:

```text
Hive Blockchain
       │
New Block
       │
Custom Listener
       │
Extract relevant operations
       │
Store in PostgreSQL
```

Only operations relevant to the application are cached.

---

## Phase 2: Hive Application Framework (HAF)

As the project grows, the custom listener can be replaced by HAF.

HAF automatically:

- Streams blockchain data
- Populates PostgreSQL tables
- Handles blockchain forks
- Maintains synchronization

Instead of writing custom parsing logic, developers can query blockchain data directly with SQL.

---

# 6. Provisioning Service

**Technology:** Standalone Node.js Service

This service is responsible for onboarding Google OAuth users.

Responsibilities:

- Create Hive accounts
- Delegate Resource Credits (RC)
- Securely store account keys

Flow:

```text
Google Login
      │
Provisioning Service
      │
account_create
      │
New Hive Account
```

---

## Resource Credit Delegation

New Hive accounts start with little or no Resource Credits (RC).

Without RC, users cannot submit transactions.

The platform delegates RC from its own account:

```text
Platform Account
        │
delegate_vesting_shares
        │
New User
```

This allows new users to immediately use the application.

---

# 7. Agent Account

The platform owns a dedicated Hive account called the **Agent Account**.

Its responsibility is automatically approving escrow transactions.

Flow:

```text
User creates escrow
        │
Blockchain confirms
        │
Agent Account detects transaction
        │
Signs escrow_approve
        │
Escrow becomes active
```

This removes the need for manual approval.

---

## Security

The Agent Account is the most sensitive account in the system.

Its active key can authorize escrow-related operations.

Therefore:

**Never store the active key inside environment variables (`.env`).**

Instead, store it inside a secure key management solution.

---

# 8. Key Management Service (KMS)

A Key Management Service securely stores private keys.

Instead of exposing keys to the application:

```text
Backend
    │
Request signature
    │
KMS
    │
Signs transaction internally
    │
Returns signature
```

The private key never leaves the secure vault.

Benefits include:

- Improved security
- Key rotation
- Audit logging
- Reduced risk of key theft

Examples include AWS KMS, Google Cloud KMS, and Azure Key Vault.

---

# 9. Hosting

**Recommended Platforms:**

- Render
- Railway

These platforms provide:

- Node.js hosting
- PostgreSQL databases
- Automatic deployments
- Free tiers suitable for MVP development

They minimize infrastructure management, allowing developers to focus on application development.

---

# Complete System Flow

The following diagram illustrates how all components work together for a Google OAuth user.

```text
User
 │
 ▼
Google Login
 │
 ▼
React Frontend
 │
 ▼
Node.js Backend
 │
 ▼
Provisioning Service
 │
Creates Hive Account
 │
Stores Keys in KMS
 │
Delegates RC
 │
 ▼
User Creates Escrow
 │
 ▼
Backend Uses WAX
 │
 ▼
Hive Blockchain
 │
 ▼
Blockchain Listener Detects Transaction
 │
 ▼
Agent Account Automatically Approves Escrow
 │
 ▼
Listener Updates PostgreSQL
 │
 ▼
React Dashboard Displays Updated Status
```

---

# Summary

| Layer | Purpose |
|--------|---------|
| React + TypeScript | User interface |
| Node.js + Express | Business logic and API |
| PostgreSQL | Relational database and cached blockchain data |
| WAX | Broadcasts Hive blockchain transactions |
| Custom Listener / HAF | Reads blockchain events and synchronizes data |
| Provisioning Service | Creates Hive accounts and delegates RC |
| Agent Account | Automatically approves escrow transactions |
| KMS | Secure storage and signing of private keys |
| Render / Railway | Application hosting |