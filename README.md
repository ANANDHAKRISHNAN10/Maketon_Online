<<<<<<< HEAD
=======
# Brightloop Gaming — Full-Stack Subscription & Billing Platform

Brightloop Gaming is a complete full-stack subscription management, gamer self-service Battlepass portal, revenue assurance intelligence, and security platform.

## 1. Architecture & Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide React, React Router, jsPDF
- **Backend**: Express + TypeScript (`server.ts`), Zod input validation, Role-Based Access Control (`ADMIN`, `STAFF`, `GAMER`)
- **Database**: SQLite (`better-sqlite3` in WAL transactional mode) with Prisma relational schema (`prisma/schema.prisma`, compatible with SQLite & PostgreSQL)
- **Financial Precision**: All monetary values are stored and calculated in integer minor units (cents, e.g., `1499` = `$14.99`) with 18% GST tax compliance.

## 2. Quick Start & Seed Instructions
```bash
# Install dependencies
npm install

# Seed database with 1 Admin, 1 Staff, 5 Gamers, 3 Plans, Leakage anomalies & Security events
npm run seed

# Run automated test suite (Billing, Pause/Resume, Rate Limiter, Revenue Leakage, Churn)
npm test

# Start full-stack server on port 3000
npm run dev
```

## 3. Seeded Demo Accounts
- **Admin**: `admin@brightloop.gg` / `BrightloopAdmin!2026`
- **Staff**: `staff@brightloop.gg` / `BrightloopStaff!2026`
- **Gamers** (`GamerPass!123`):
  - `alex@gamer.gg` — Active Monthly Champion Tier, Parental Safety Gate PIN `4210`
  - `maya@gamer.gg` — Active subscription missing an invoice (Revenue Leakage #1)
  - `liam@gamer.gg` — Duplicate billing period invoices (Leakage #2) & High Churn Risk
  - `sofia@gamer.gg` — Expired promo `SUMMERFLASH50` on draft invoice (Leakage #3) + Unlinked `$49.99` payment (Leakage #4)
  - `noah@gamer.gg` — Flagged for 1-hour Geo-IP Jump (`US -> JP`) with 48-hour Trade Lock

## 4. Key API Endpoints
- `POST /api/subscriptions/:id/pause` — Validates pause allowance, freezes Battlepass perks, and records planned duration (7, 14, or 30 days).
- `POST /api/subscriptions/:id/resume` — Restores perks and extends `currentPeriodEnd` by the paused duration.
- `POST /api/billing/generate-invoices` — Generates 18% GST invoices for due subscriptions with `(subscriptionId, billingPeriodKey)` duplicate prevention.
- `GET /api/intelligence/revenue-leakage` — Detects uninvoiced active subscriptions, duplicate invoices, expired draft discounts, and unlinked payments (`$49.99`).
- `POST /api/intelligence/fix-leakage` & `POST /api/intelligence/auto-reconcile` — Atomic database reconciliation of detected anomalies.
- `GET /api/intelligence/churn-prediction` — Weighted 0–100 risk score (30% failed payments, 25% pause frequency, 20% days to expiry, 25% tenure).
- `POST /api/security/checkout-rate-limit` — Token-bucket rate limiter & 3-failed-card-attempts IP blocker.
- `GET /api/intelligence/executive-report` — Generates live Markdown financial brief with overdue collection priorities ranked by `Amount × Days Overdue`.
>>>>>>> 7b1f407880fc9bc853d39bd222d1c4d72484f777
