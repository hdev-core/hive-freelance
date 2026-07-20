# Design System Notes: Freelance Marketplace Platform (Upwork-Style) — Hive-Enhanced

# 1. Design System Overview

This document defines the visual identity, UI principles, and reusable components used throughout the freelance marketplace platform.

The design system aims to create a professional, trustworthy, and intuitive experience for all users.

The interface combines:
- Modern SaaS marketplace aesthetics
- Clear information hierarchy
- Trust-focused design patterns
- Blockchain transparency concepts inspired by Hive

The system supports three user roles:
- **Clients:** Sourcing talent, managing escrow funds, and reviewing proposals.
- **Freelancers:** Discovering gigs, submitting milestone proposals, and tracking earnings.
- **Admins:** Overseeing the platform ecosystem, reviewing system issues, and managing network stability.

---

# 2. Brand Identity

## Brand Personality

The platform should communicate:

| Attribute | Design Direction |
|-----------|-----------------|
| Trustworthy | Clean layouts, transparent block metrics, verified indicators |
| Professional | Structured dashboards and role-focused interfaces |
| Accessible | Simple navigation, clear typography, understandable actions |
| Transparent | Visible reputation scores, contract milestones, and blockchain transaction verification |
| Collaborative | Communication-focused workspaces and real-time chat updates |

---

# 3. Visual Style

## Overall Style

The interface follows a modern marketplace/SaaS style:

- Minimal and clean layouts
- Card-based information organization (white surface containers with thin borders and subtle shadows)
- Clear call-to-action buttons
- Consistent spacing and high information density
- Professional sans-serif typography
- Focus on user-generated and on-chain content

The design prioritizes usability, data clarity, and security indicators over decorative elements.

---

# 4. Color System

The platform uses a **two-tier color system** with a unified theme mapping, ensuring every light mode color token has a corresponding high-contrast, low-glare equivalent in dark mode.

- **Tier 1 — Chrome palette:** black, greys, and a single red accent only. This covers every structural UI element — backgrounds, surfaces, borders, text, navigation, buttons, cards, tags, avatars. No other hue is used here, including blue. Red is used only as a background/fill for pill or circle shapes (buttons, active-nav pills, badges, tags); it is never used as text color — regular text always stays neutral (black/grey/white depending on theme).
- **Tier 2 — Semantic status palette:** a small, separate palette used *only* for status/state indicators (badges, pills, trend icons) such as pending, success, and network-health dots. It must never be used for chrome (layout, navigation, buttons, borders).

## Core Chrome Palette

| Element / Usage | Light Mode Hex | Dark Mode Hex | Purpose |
|:---|:---|:---|:---|
| **Accent (Red)** | `#E31337` | `#FF3D5A` | Primary CTAs, escrow/on-chain states, active-nav indicators, Hive Keychain actions — always as a fill, never as text color |
| **Accent Hover / Pressed** | `#C10E2C` / `#A50C26` | `#FF5C76` / `#D62842` | Hover and active states for the accent fill |
| **Accent Subtle** | `#FEE2E2` | `#3A1016` | Tinted red backgrounds for tags, avatars, and active-nav pills (paired with neutral text) |
| **Accent Subtle Border** | `#FECACA` | `#5C1822` | Border for tinted-red tags/chips/badges paired with Accent Subtle |
| **Canvas Background** | `#F8FAFC` | `#0A0D12` | Global application layout background canvas |
| **Surface / Container** | `#FFFFFF` | `#14171C` | Cards, dashboard widgets, sidebars, panels, form inputs |
| **Surface Muted** | `#F1F5F9` | `#1B1F26` | Secondary surfaces, hover backgrounds, code/detail blocks |
| **Primary Text** | `#0F172A` | `#F5F5F7` | Headers, page titles, primary labels, main copy |
| **Secondary Text** | `#64748B` | `#9AA1AC` | Subtitles, desaturated metadata, timestamps, hashes, nav links |
| **Muted Text** | `#94A3B8` | `#6E7682` | Placeholder text, disabled labels, least-emphasis captions |
| **Borders / Separators** | `#E2E8F0` | `#282D35` | Card boundaries, input outlines, table row dividers |
| **Borders Strong** | `#CBD5E1` | `#3A404A` | Hover/emphasis border state, e.g. on card or nav hover |

Red is the only non-neutral chrome hue. There is no separate blue "primary brand accent" — every CTA, including non-blockchain actions, uses the red accent.

---

## Semantic Status Palette

Status badges and system alerts use background fills paired with high-contrast text strings. This is the one place outside the chrome palette where color is used, and it is scoped strictly to status/state indicators.

| State Indicator | Light Mode (BG / Text) | Dark Mode (BG / Text) | Platform Use Case |
|:---|:---|:---|:---|
| **Success / Growth** | `#ECFDF5` / `#047857` | `#062F21` / `#10B981` | Completed contracts, payments, positive wallet/earnings indicators |
| **Warning / Pending** | `#FEF3C7` / `#92400E` | `#2D1F06` / `#F59E0B` | Deadlines, milestones pending review, "Awaiting Funding" |
| **Error / On-Chain Accent** | Solid Accent fill / white text | Solid Accent fill / white text | Escrow funded badges, confirmed/released transactions, failed transactions, validation errors — reuses the chrome accent as a solid fill with neutral (white) text, never colored text |

There is no blue "Information" status; use a neutral grey badge (Surface Muted background, Secondary Text) for informational states instead.

---

## Theme Consistency Rules

Both themes must strictly maintain:
- The exact same component padding and structural footprint.
- Identical typography sizing and hierarchy rules.
- Shared functional status rules (e.g., if a state is visually highlighted in Light Mode, it must remain proportionally highlighted in Dark Mode).

---

# 5. Typography

## Typography Goals

Typography should provide:
- Strong visual hierarchy
- High readability for numbers and data points
- A clean, professional appearance

## Text Hierarchy

| Element / Token | Font Weight | Line Height | Case Style | Typical Usage Context |
|--------|------|-------------|------------|-----------------------|
| Heading 1 | Bold (700) | 1.25 | Sentence | Main dashboard greetings (e.g., "Welcome back, Maya") |
| Heading 2 | SemiBold (600) | 1.375 | Sentence | Major sections and component categories |
| Heading 3 | SemiBold (600) | 1.375 | Sentence | Job titles, modal headers, and sub-sections |
| Body Text | Regular (400) | 1.625 | Sentence | Descriptions, long messages, and proposal cover letters |
| Numeric Text | Bold (700) | 1.10 | Normal | Primary asset amounts and pricing (e.g., "42,150 HIVE") |
| Caption Text | Medium (500) | 1.40 | Normal | Timestamps, labels, block numbers, and hashes |

Heading 1 through Body Text map directly to the base `h1`/`h2`/`h3`/`p` styles in the shared stylesheet (Tailwind's `leading-tight`/`leading-snug`/`leading-snug`/`leading-relaxed`). Numeric Text and Caption Text are not yet implemented as their own utility classes — apply the weight/line-height above manually until a dedicated token exists.

---

# 6. Layout Principles

## Spacing

The interface uses consistent spacing patterns to maintain layout clarity.

Common spacing rules:
- **Global Layout Canvas:** Standard 1440px viewport container width with variable responsive scaling.
- **Dashboard Layout:** Standard two-column configuration featuring a left navigation sidebar (256px wide, collapsible to an 80px icon-only rail via a toggle in the sidebar header) paired with a fluid main stage canvas.
- **Content Card Padding:** Structural components and summary cards use explicit 24px padding.
- **Data Table Padding:** Tabular listings use a compressed 16px row padding to maximize scanning efficiency.

---

## Responsive Design

All pages should support:
- Desktop layouts
- Tablet layouts
- Mobile-friendly views

Layouts adapt seamlessly by:
- Stacking layout grids and cards vertically
- Collapsing sidebars and main navigation links into clean toggle menus
- Transforming tables into readable linear listing layouts
- Simplifying large analytic dashboards to show core data summaries

---

# 7. Core UI Components

## Navigation Components

### Navbar

Used across public-facing visitor routes and marketing landing pathways.

Contains:
- Platform logo (icon mark in a tinted-red circle badge + wordmark; the icon mark image swaps automatically between a light-mode and dark-mode asset with the active theme)
- Public navigation links
- Theme toggle control (light/dark)
- Authentication state actions (`Sign In` link / `Connect Hive Wallet` action button)

---

### Sidebar Navigation

Used for authenticated dashboards. It dynamically displays routes according to the user's active role. The whole rail is collapsible to an icon-only state via a toggle next to the brand header, and the collapsed/expanded state persists across sessions.

Contains:
- **Platform Brand Header:** Logo container linked to the default landing path, with the collapse/expand toggle beside it (toggle only; wordmark hides when collapsed). A horizontal divider separates this header from the menu stack below.
- **Client/Freelancer Menu Stack:** Icon-accompanied vertical links (`Overview`, `Jobs`, `Proposals`, `Messages`, `Escrow & Wallet`).
- **Admin Specific Stack:** Links for `Platform Metrics`, `Dispute Center`, `User Management`, and `System Logs`. Phase 2 — not part of the MVP sidebar (see Section 12).
- **User Anchor Block:** Fixed base element displaying active avatar, profile display name, and unique Hive account handle identifier (`@maya.hive`). Clicking it opens a popover menu with `Settings`, `Profile`, a divider, and `Log out`. There is no separate standalone `Settings` link in the menu stack — it lives only in this popover.

---

## Buttons

### Primary Button

Purpose: Used for the primary, high-priority call to action on a page.

Examples:
- Create Job / Post a job
- Apply Now / Submit Proposal
- Approve & Release
- Deposit / Connect Hive Account

Style: Solid `#E31337` accent fill with crisp white text for every primary action — standard and Hive-specific alike. There is no separate blue primary; the red accent is the single primary CTA color across the platform.

### Secondary Button

Purpose: Used for alternative or secondary navigation and actions.

Examples:
- Cancel
- Message Client / Message Freelancer
- Withdraw
- Save Draft

Style: Soft gray surface background paired with secondary neutral brand text.

### Destructive Button

Purpose: Used for irreversible system actions.

Examples:
- Delete Job
- Reject Proposal
- Suspend Account (Admin)

Style: Transparent/surface background with a red accent border and neutral (never red) text, so it reads as distinct from the solid-fill Primary button while still keeping red scoped to a fill/border role, not text.

### Inverse Button

Purpose: Used for the single highest-emphasis identity action on a page, distinct from the platform's red primary action — currently only `Sign in with Hive Keychain`.

Style: Solid fill using the Primary Text color, with Canvas-color text. Because both tokens flip with the theme, this button automatically inverts — near-black fill in light mode, near-white fill in dark mode — with no separate dark-mode override needed.

### Outline Button

Purpose: Used for third-party auth actions where the provider's own branding (e.g. the Google "G" mark) needs to sit on a neutral, unbranded surface rather than the red primary fill — currently only `Continue with Google`.

Style: Surface-colored background with a visible Border, neutral text, and the provider's icon at the leading edge.

---

## Cards

Cards are the foundational containers used to organize information.

Used for:
- Job marketplace postings
- Freelancer profile summaries
- Main dashboard analytics and statistics
- Real-time notification updates
- Immutable transaction logs

Card layout structure:

    Title Block / Category + Status Badges
    ↓
    Main Metrics / Core Body Information
    ↓
    Metadata Rows (Tags, Ratings, Location)
    ↓
    Action Bar / Component Buttons

---

## Forms

Forms follow a highly structured layout logic:

Components:
- Grouped field containers within clean layout surfaces
- Clean input fields and description textareas with crisp border boundaries
- Interactive data selectors and milestone definition arrays (to set deliverables, individual budgets, and timelines)
- Clear validation errors, status highlights, and active submit buttons

Used for:
- User registration and setup
- Job listing generation
- Step-by-step proposal submission
- Milestone tracking and processing

---

# 8. Marketplace Components

## Job Card

Displays project opportunities throughout search feeds and recommendation panels.

Contains:
- Upper info line: Category label (e.g., `Development`), posting timestamp, and funding indicator badge (`Escrow Funded`)
- Typography title: Large font link displaying the complete project title
- Description text block: Concise 2-3 line preview summarizing the required task
- Tag array: List of pill-shaped tags showing required skills (e.g., `Solidity`, `Security Audit`)
- Footer metadata string: Client ratings, geographic location, active proposal count, and distinct budget parameters

---

## Job Detail Section

Displays comprehensive job parameters on unique landing paths.

Contains:
- Full un-truncated description block and clear milestone breakdowns
- Comprehensive tech stack demands and required skills
- Exact budget classifications, expected execution timelines, and blockchain network targets
- Summary profile card for the hiring client (history, total spent, profile verification score)
- Floating sidebar containing direct structural actions (`Apply Now`, `Message Client`)

---

## Profile Card

Displays user identity and track records to build ecosystem trust.

Contains:
- User avatar frame and full display name
- Complete skill inventory badges
- Average star rating scores and comprehensive review historical logs
- Overall experience levels, historical earnings summary, and Hive account verification states

---

## Proposal Card

Displays freelancer applications within client review flows.

Contains:
- Detailed freelancer information and overview metrics
- Custom cover letter introduction and introductory message text
- Line-item budget distributions matching requested milestone schedules
- Estimated time metrics and direct administrative controls (`Accept Proposal`, `Reject Proposal`)

---

# 9. Dashboard Components

## Statistics Card

High-density visual blocks positioned to quickly communicate key account performance and metrics.

Examples:
- Active Jobs / Active Contracts counts
- Funds held securely in escrow
- Total historical earnings or spend charts
- Hive account balance and asset updates (with fiat estimates)

---

## Data Table

Used to organize detailed transactions, contract updates, and history in a clean, tabular format.

Features:
- Configurable layout columns with explicit bold headers
- Clean, searchable row dividers with action links
- Data filters, sort controls, and page controls

Columns include:
- Type (e.g., `Escrow Deposit`, `Milestone Release`, `Platform Fee`)
- Token Amount (color-coded for incoming green/outgoing dark values)
- Transaction Validation Status Badges (`Confirmed`, `Pending`, `Released`)
- Calendar Date Timestamps, System Block Heights, and click-route Transaction Hashes (`Tx Hash`)

---

## Status Badge

Pill-shaped layout badges displaying state classifications for core entities.

Examples:

| Status Badge | Layout Style | System Use Case |
|--------------|--------------|-----------------|
| **Active / In Progress** | Neutral grey background fill | Running contract being executed by a freelancer |
| **Escrow Funded / Confirmed** | Solid Hive crimson accent fill, white text | Funds locked on-chain or payment successfully completed |
| **Awaiting Funding / Pending** | Amber background fill (semantic warning) | Processing transactions or waiting for client escrow lock |
| **Suspended / Rejected** | Solid Hive crimson accent fill, white text | Canceled paths, validation issues, or flagged accounts |

---

## Activity Timeline

Shows chronological project and platform histories.

Used for:
- Detailed contract step completions and deliveries
- Chronological release approvals and milestone updates
- Historical dispute and resolution logs

---

# 10. Communication Components

## Chat Interface

A multi-pane collaboration setup that connects chat communication with related contract tasks.

Contains:
- **Left Filter Bar:** Searchable vertical list of user conversations, display avatars, online status dots, and unread notification badges.
- **Center Message Area:** Sequential text stream containing crisp chat bubbles, clear time groupings, file attachment objects, and message validation tags.
- **Right Context Side Panel:** Dedicated summary section displaying active project details, locked escrow totals, current milestone completion lists, and direct buttons to release project funds (`Approve & Release`).

---

# 11. Blockchain Components

## Hive Account Connection Component

Manages Hive account connection and identity validation throughout top navigation bars and profile forms.

Contains:
- Current Hive network connection status indicators
- Active account identity tags and connected Hive account handle markers
- Direct modal triggers to pair or swap active Hive accounts

---

## Transaction Card

Dedicated block summaries documenting individual transfers over blockchain layers.

Contains:
- Unique clickable transaction hash links routing to blockchain explorers
- Precise token amounts and related network fees
- Timestamp structures and consensus block confirmations

Implementation handoff note: the transaction card should consume the escrow/payment fields defined in Laure's schema and escrow model, including payment status, escrow transaction IDs, and confirmation state rather than inventing separate UI-only fields.

---

## Trust / Verification Badge

Visual markers that confirm verified accounts and on-chain security.

Used to highlight:
- Fully verified user identity checks
- Successfully funded and locked native Hive escrows
- Validated block logs and system compliance markers

Implementation handoff note: the badge and any milestone-state visuals should be wired to the shared schema fields for user/profile verification, contract status, milestone status, payment status, and on-chain confirmation so they stay aligned with Laure's escrow model.

---

# 12. Admin Management Components (Phase 2)

## Admin Overview Dashboard (Phase 2)

A high-level interface tailored for platform admins to monitor network health, manage users, and resolve disputes. This is a future-phase design exploration and is not part of the MVP scope.

Contains:
- **Ecosystem Monitoring Cards:** Top-level metrics tracking total platform transactional volume, active escrow value, total registered user metrics, and current unresolved dispute flags.
- **Dispute Resolution Workspace (Phase 2):** A specialized layout comparing user contracts, milestones, and chat logs side-by-side, equipped with admin controls to release funds or issue refunds.
- **User Compliance Controls:** Administrative tools attached to profile files to adjust user permissions, flag bad actors, check identity statuses, or issue temporary account suspensions.
- **System Activity Log Grid:** High-density transaction tables tracking global portal actions, security exceptions, on-chain escrow adjustments, and administrative overrides.

---

# 13. Component Consistency Rules

All components should follow:

| Rule | Purpose |
|------|---------|
| Reuse existing tokens | Maintain consistent colors, typography, spacing, and brand identity |
| Keep actions predictable | Keep primary buttons, navigation patterns, and form layouts uniform across roles |
| Use clear semantic labels | Reduce confusion during high-stakes financial and contract paths |
| Display critical info first | Put primary metrics, project statuses, and account/escrow metrics at the top of layouts |
| Provide explicit feedback | Show clear updates after actions, especially during blockchain transaction flows |
| Admin actions require validation | Require explicit confirmation steps for all platform-wide administrative interventions |

---

# 14. Design System Summary

The design system focuses on creating a reliable freelance marketplace experience through:

- Consistent reusable components
- Clear user workflows adapted for clients, freelancers, and admins
- Professional visual identity
- Trust-focused blockchain elements
- Scalable UI patterns

The system supports all major platform experiences:
- Landing pages and public marketplace discovery
- Complete job posting and multi-step proposal flows
- Comprehensive user dashboards and administrative centers
- Combined messaging and milestone contract views
- Verifiable blockchain payment tracking and wallet interactions