# Personal Financial Tracker Bot — Technical Requirements Document (TRD)

> **Version:** 3.0.0
> **Date:** 2026-05-18
> **Status:** FINAL — Ready for AI Agent Execution
> **Owner:** Solo Developer (Personal Use)
> **Platform:** Telegram Bot ONLY
> **Intended Reader:** AI Agent / Autonomous Developer

---

## ⚡ AI Agent Quick-Start

This document is the single source of truth for building the Personal Financial Tracker Bot.
All decisions are **final**. There are no alternatives to evaluate, no "or" options to choose from.
Read this document top-to-bottom before writing any code. Every section is a direct instruction.

**Stack is decided. Platform is decided. Architecture is decided.**
Your job is to implement, not to choose.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [FINAL Tech Stack](#3-final-tech-stack)
4. [System Architecture](#4-system-architecture)
5. [Project Structure](#5-project-structure)
6. [Core Features & Commands](#6-core-features--commands)
7. [Data Models](#7-data-models)
8. [Database Schema](#8-database-schema)
9. [Bot Conversation Flows](#9-bot-conversation-flows)
10. [Service Layer Design](#10-service-layer-design)
11. [Scheduled Jobs](#11-scheduled-jobs)
12. [AI/NLP Integration](#12-ainlp-integration)
13. [Security](#13-security)
14. [Environment Variables](#14-environment-variables)
15. [Infrastructure & Deployment](#15-infrastructure--deployment)
16. [Cost Breakdown](#16-cost-breakdown)
17. [Development Phases & Milestones](#17-development-phases--milestones)
18. [Testing Strategy](#18-testing-strategy)
19. [Future Enhancements](#19-future-enhancements)
20. [Glossary](#20-glossary)

---

## 1. Executive Summary

A personal Telegram bot that tracks income, expenses, budgets, savings goals, and recurring transactions for **one user** (the owner). Natural language input is parsed by AI. Summaries, alerts, and exports are delivered inside Telegram. The entire infrastructure runs on **$0/month** using free tiers.

**Platform:** Telegram only. No WhatsApp. No web app. No other messaging platform.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Log income and expenses via natural language (`spent 50 on lunch`)
- Auto-categorise transactions using AI
- On-demand summaries: daily, weekly, monthly, by category
- Budget limits per category with push alerts at 80% and 100%
- Savings goals with progress tracking and deadline reminders
- Recurring transactions auto-logged on schedule
- Multi-currency with live exchange rates
- Export as CSV and PDF, delivered as Telegram file messages
- AI-powered monthly spending insights
- $0/month infrastructure cost

### 2.2 Non-Goals (permanently excluded — do not implement)

- No WhatsApp integration — ever
- No multi-user support
- No public web dashboard (personal Telegram Mini App is Phase 4 only)
- No banking API integrations (Plaid, open banking)
- No real-time stock or crypto tracking
- No separate mobile app

---

## 3. FINAL Tech Stack

> All choices below are **decided and locked**. Do not substitute, do not evaluate alternatives.

### 3.1 Language & Runtime

```
Language:   TypeScript 5.x
Runtime:    Node.js 20 LTS
```

### 3.2 Bot Framework

```
Library:    telegraf@^4.16.0
Reason:     Best-in-class Telegram bot framework for Node.js.
            Webhook-native, middleware-based, full TypeScript support.
```

### 3.3 Web Server

```
Library:    hono@^4.0.0
Reason:     Ultra-lightweight, edge-ready HTTP server.
            Fast cold starts, minimal overhead for webhook handling.
```

### 3.4 Database

```
Service:    Supabase (PostgreSQL 15)
Client:     @supabase/supabase-js@^2.x
Plan:       Free tier (500 MB storage, unlimited rows)
Reason:     Managed PostgreSQL with free tier, built-in backups,
            REST + realtime APIs, and a clean dashboard.
```

### 3.5 Cache & Session Store

```
Service:    Upstash Redis
Client:     ioredis@^5.x  (Upstash-compatible)
Plan:       Free tier (10,000 requests/day, 256 MB)
Reason:     Serverless Redis with HTTP fallback. Stores conversation state
            and budget alert deduplication flags.
```

### 3.6 File Storage

```
Service:    Cloudflare R2
Client:     @aws-sdk/client-s3@^3.x  (R2 is S3-compatible)
Plan:       Free tier (10 GB/month, 1M requests/month)
Reason:     Free object storage for CSV and PDF export files.
            Files auto-deleted after 24 hours via lifecycle rules.
```

### 3.7 AI / NLP

```
Primary:    Google Gemini 2.0 Flash
Client:     @google/generative-ai@^0.x
Plan:       Free tier (15 req/min, 1,000,000 tokens/day)
Reason:     Best free LLM for NLP parsing and insight generation.

Fallback:   Groq API (Llama 3.1 70B)
Client:     groq-sdk@^0.x
Plan:       Free tier (30 req/min)
Reason:     Auto-fallback when Gemini is unavailable or rate-limited.
```

### 3.8 Exchange Rates

```
Service:    frankfurter.app
Auth:       None (no API key required)
Endpoint:   https://api.frankfurter.app/latest
Reason:     Free, open-source, no registration, reliable uptime.
```

### 3.9 Job Scheduler

```
Library:    node-cron@^3.x
Reason:     Lightweight in-process cron scheduler.
            Runs recurring transaction processing, budget checks, digests.
```

### 3.10 Validation

```
Library:    zod@^3.x
Reason:     Runtime schema validation for all incoming data and API responses.
```

### 3.11 PDF Generation

```
Library:    pdfkit@^0.x
Reason:     Pure Node.js PDF generation, no external binary dependencies.
```

### 3.12 CSV Generation

```
Library:    csv-stringify@^6.x
Reason:     Streaming CSV generation, handles special characters correctly.
```

### 3.13 Date Handling

```
Libraries:  date-fns@^3.x  +  date-fns-tz@^3.x
Reason:     Immutable date utilities with full timezone support.
            Used for relative date parsing, period calculations, cron scheduling.
```

### 3.14 Currency Formatting

```
Library:    currency.js@^2.x
Reason:     Precise decimal arithmetic for monetary values (avoids float errors).
```

### 3.15 HTTP Client

```
Library:    axios@^1.x
Reason:     Used for frankfurter.app exchange rate API calls.
```

### 3.16 Hosting

```
Service:    Fly.io
Plan:       Free allowance (3 shared-CPU VMs, always-on, 256 MB RAM each)
Reason:     Always-on free hosting (unlike Render which sleeps).
            Supports persistent processes needed for cron jobs.
            Simple Docker-based deployment.
```

### 3.17 Monitoring & Logging

```
Error tracking:   Sentry.io            (free: 5,000 events/month)
                  Client: @sentry/node@^8.x

Application logs: Better Stack Logtail (free: 1 GB/month)
                  Transport: pino@^9.x + pino-http@^10.x

Uptime monitor:   Better Stack Uptime  (free: 10 monitors)
```

### 3.18 CI/CD

```
Service:    GitHub Actions
Plan:       Free (2,000 minutes/month)
Trigger:    Push to main branch → run tests → deploy to Fly.io
```

### 3.19 Complete package.json Dependencies

```json
{
  "name": "financebot",
  "version": "1.0.0",
  "private": true,
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "dev":   "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test":  "vitest run",
    "test:watch": "vitest",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed":    "tsx src/db/seed.ts"
  },
  "dependencies": {
    "telegraf":               "^4.16.0",
    "hono":                   "^4.0.0",
    "@hono/node-server":      "^1.0.0",
    "@supabase/supabase-js":  "^2.39.0",
    "ioredis":                "^5.3.2",
    "@aws-sdk/client-s3":     "^3.600.0",
    "@google/generative-ai":  "^0.15.0",
    "groq-sdk":               "^0.7.0",
    "node-cron":              "^3.0.3",
    "zod":                    "^3.23.0",
    "pdfkit":                 "^0.15.0",
    "csv-stringify":          "^6.5.0",
    "date-fns":               "^3.6.0",
    "date-fns-tz":            "^3.1.3",
    "currency.js":            "^2.0.4",
    "axios":                  "^1.7.0",
    "pino":                   "^9.2.0",
    "pino-http":              "^10.2.0",
    "@sentry/node":           "^8.17.0",
    "dotenv":                 "^16.4.0"
  },
  "devDependencies": {
    "typescript":             "^5.4.0",
    "tsx":                    "^4.15.0",
    "@types/node":            "^20.14.0",
    "@types/pdfkit":          "^0.13.4",
    "vitest":                 "^1.6.0",
    "supertest":              "^7.0.0",
    "@types/supertest":       "^6.0.2",
    "msw":                    "^2.3.0"
  }
}
```

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    OWNER'S DEVICE                       │
│                Telegram App (1 user only)               │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS Webhook (POST)
                           ▼
┌─────────────────────────────────────────────────────────┐
│              TELEGRAM BOT API (free, unlimited)         │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│         APPLICATION SERVER — Fly.io (free tier)         │
│              Node.js 20 + TypeScript                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              HONO WEB SERVER                    │    │
│  │  POST /webhook/telegram  ←── all updates        │    │
│  │  GET  /health            ←── uptime monitor     │    │
│  └────────────────┬────────────────────────────────┘    │
│                   │                                      │
│  ┌────────────────▼────────────────────────────────┐    │
│  │           TELEGRAF BOT INSTANCE                 │    │
│  │  Owner-gate middleware (drop unknown IDs)       │    │
│  │  Conversation state middleware (Redis)          │    │
│  │  Command router  /  Text message handler        │    │
│  └────────────────┬────────────────────────────────┘    │
│                   │                                      │
│  ┌────────────────▼────────────────────────────────┐    │
│  │              SERVICE LAYER                      │    │
│  │  TransactionService  │  BudgetService           │    │
│  │  GoalService         │  RecurringService        │    │
│  │  NLPService          │  InsightService          │    │
│  │  ReportService       │  CurrencyService         │    │
│  └────────────────┬────────────────────────────────┘    │
│                   │                                      │
│  ┌────────────────▼────────────────────────────────┐    │
│  │           CRON SCHEDULER (node-cron)            │    │
│  │  process_recurring   │  check_budget_alerts     │    │
│  │  refresh_rates       │  daily_digest            │    │
│  │  goal_reminders      │  weekly_digest           │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────┬────────────────┬────────────────┬────────┘
               │                │                │
               ▼                ▼                ▼
┌──────────────────┐  ┌──────────────┐  ┌───────────────┐
│   SUPABASE       │  │  UPSTASH     │  │ CLOUDFLARE R2 │
│   PostgreSQL     │  │  Redis       │  │ File Storage  │
│   (free 500MB)   │  │  (free tier) │  │ (free 10GB)   │
└──────────────────┘  └──────────────┘  └───────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              EXTERNAL APIS (all free)                │
│  Gemini Flash  │  Groq Llama  │  frankfurter.app     │
└──────────────────────────────────────────────────────┘
```

---

## 5. Project Structure

```
financebot/
├── src/
│   ├── server.ts                    ← Hono server entry point, webhook registration
│   ├── bot/
│   │   ├── index.ts                 ← Telegraf instance, middleware chain
│   │   ├── middleware/
│   │   │   ├── ownerGate.ts         ← Drop all messages not from OWNER_TELEGRAM_ID
│   │   │   ├── conversationState.ts ← Load/save state from Redis per update
│   │   │   └── errorHandler.ts      ← Catch errors, send friendly reply, log to Sentry
│   │   ├── commands/
│   │   │   ├── start.ts             ← /start onboarding flow
│   │   │   ├── help.ts              ← /help
│   │   │   ├── add.ts               ← /add expense, /add income
│   │   │   ├── history.ts           ← /history, /delete, /edit
│   │   │   ├── summary.ts           ← /summary, /summary week, /summary today
│   │   │   ├── budget.ts            ← /budget set, /budget status, /budget delete
│   │   │   ├── goals.ts             ← /goal set, /goal add, /goal list, /goal delete
│   │   │   ├── recurring.ts         ← /recurring add, /recurring list, /recurring delete
│   │   │   ├── export.ts            ← /export csv, /export pdf
│   │   │   ├── insights.ts          ← /insights
│   │   │   ├── categories.ts        ← /categories, /categories add, /categories delete
│   │   │   └── settings.ts          ← /settings, /currency
│   │   └── handlers/
│   │       ├── textMessage.ts       ← NLP entry point for free-form messages
│   │       └── callbackQuery.ts     ← Inline keyboard button handler
│   ├── services/
│   │   ├── transaction.ts
│   │   ├── budget.ts
│   │   ├── goal.ts
│   │   ├── recurring.ts
│   │   ├── nlp.ts
│   │   ├── insight.ts
│   │   ├── report.ts
│   │   └── currency.ts
│   ├── db/
│   │   ├── client.ts                ← Supabase client singleton
│   │   ├── migrate.ts               ← Run SQL migrations in order
│   │   ├── seed.ts                  ← Seed default categories and owner record
│   │   └── migrations/
│   │       ├── 001_initial_schema.sql
│   │       ├── 002_views.sql
│   │       └── 003_indexes.sql
│   ├── jobs/
│   │   ├── scheduler.ts             ← Register all cron jobs on startup
│   │   ├── processRecurring.ts
│   │   ├── checkBudgets.ts
│   │   ├── refreshRates.ts
│   │   ├── goalReminders.ts
│   │   ├── dailyDigest.ts
│   │   └── weeklyDigest.ts
│   ├── storage/
│   │   └── r2.ts                    ← Cloudflare R2 upload/delete helpers
│   ├── utils/
│   │   ├── formatters.ts            ← formatCurrency, formatDate, progressBar
│   │   ├── dateParser.ts            ← Parse relative dates ("yesterday", "last Monday")
│   │   ├── keyboard.ts              ← Reusable inline keyboard builders
│   │   └── constants.ts             ← DEFAULT_CATEGORIES, CURRENCIES, TIMEZONES
│   └── types/
│       └── index.ts                 ← Shared TypeScript type definitions
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   ├── webhook.test.ts
│   │   └── cron.test.ts
│   └── fixtures/
│       ├── nlpTestCases.ts          ← 50+ NLP input/expected pairs
│       └── transactions.ts
├── Dockerfile
├── fly.toml
├── docker-compose.yml               ← Local dev: app + postgres + redis
├── .env.example
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## 6. Core Features & Commands

### 6.1 Full Command List

| Command | Description | Example |
|---|---|---|
| `/start` | Onboarding: set currency and timezone | `/start` |
| `/help` | Show all commands with descriptions | `/help` |
| `<free text>` | Log transaction via natural language | `spent 12.50 on coffee` |
| `/add expense` | Guided interactive expense entry | `/add expense` |
| `/add income` | Guided interactive income entry | `/add income` |
| `/history` | Show last 10 transactions | `/history` |
| `/history <N>` | Show last N transactions (max 50) | `/history 20` |
| `/delete last` | Delete most recent transaction | `/delete last` |
| `/delete <id>` | Delete transaction by short ID | `/delete abc123` |
| `/edit last` | Edit most recent transaction | `/edit last` |
| `/summary` | Current month summary | `/summary` |
| `/summary week` | Current week summary | `/summary week` |
| `/summary today` | Today's transactions and total | `/summary today` |
| `/summary <YYYY-MM>` | Summary for a specific month | `/summary 2026-04` |
| `/budget set <cat> <amt>` | Set monthly budget for a category | `/budget set food 500` |
| `/budget status` | View all budgets with usage bars | `/budget status` |
| `/budget delete <cat>` | Remove a budget | `/budget delete food` |
| `/goal set <name> <target> <date>` | Create savings goal with deadline | `/goal set Laptop 1500 2026-12-31` |
| `/goal set <name> <target>` | Create savings goal without deadline | `/goal set Vacation 2000` |
| `/goal add <name> <amount>` | Contribute to a savings goal | `/goal add Laptop 200` |
| `/goal list` | List all goals with progress | `/goal list` |
| `/goal delete <name>` | Delete a savings goal | `/goal delete Laptop` |
| `/recurring add` | Guided recurring transaction setup | `/recurring add` |
| `/recurring list` | List all recurring entries | `/recurring list` |
| `/recurring delete <id>` | Remove a recurring entry | `/recurring delete r001` |
| `/categories` | List all categories | `/categories` |
| `/categories add <name> <icon>` | Add custom category | `/categories add Gym 🏋️` |
| `/categories delete <name>` | Delete custom category | `/categories delete Gym` |
| `/export csv` | Export all transactions as CSV file | `/export csv` |
| `/export csv <YYYY-MM>` | Export specific month as CSV | `/export csv 2026-04` |
| `/export pdf` | Export current month report as PDF | `/export pdf` |
| `/export pdf <YYYY-MM>` | Export specific month as PDF | `/export pdf 2026-04` |
| `/insights` | AI-generated spending analysis | `/insights` |
| `/currency <code>` | Change base display currency | `/currency IDR` |
| `/settings` | View and edit all preferences | `/settings` |
| `/settings timezone <tz>` | Update timezone (IANA format) | `/settings timezone Asia/Jakarta` |

### 6.2 Default Categories

```typescript
// src/utils/constants.ts

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food & Dining",    icon: "🍔", color: "#FF6B6B" },
  { name: "Transport",        icon: "🚗", color: "#4ECDC4" },
  { name: "Housing & Rent",   icon: "🏠", color: "#45B7D1" },
  { name: "Utilities",        icon: "💡", color: "#96CEB4" },
  { name: "Health & Medical", icon: "🏥", color: "#FFEAA7" },
  { name: "Entertainment",    icon: "🎮", color: "#DDA0DD" },
  { name: "Shopping",         icon: "👕", color: "#98D8C8" },
  { name: "Education",        icon: "📚", color: "#F7DC6F" },
  { name: "Travel",           icon: "✈️", color: "#85C1E9" },
  { name: "Work & Business",  icon: "💼", color: "#A9CCE3" },
  { name: "Pets",             icon: "🐾", color: "#F0B27A" },
  { name: "Gifts & Donations",icon: "🎁", color: "#C39BD3" },
  { name: "Subscriptions",    icon: "📱", color: "#76D7C4" },
  { name: "Maintenance",      icon: "🔧", color: "#AED6F1" },
  { name: "Other",            icon: "❓", color: "#BFC9CA" },
];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: "Salary",           icon: "💵", color: "#2ECC71" },
  { name: "Investment",       icon: "🏦", color: "#27AE60" },
  { name: "Freelance",        icon: "🧾", color: "#1ABC9C" },
  { name: "Bonus / Gift",     icon: "🎁", color: "#16A085" },
  { name: "Refund",           icon: "💸", color: "#48C9B0" },
  { name: "Other Income",     icon: "❓", color: "#A9DFBF" },
];
```

---

## 7. Data Models

### 7.1 TypeScript Types

```typescript
// src/types/index.ts

export type TransactionType = "income" | "expense" | "transfer";
export type TransactionSource = "manual" | "recurring" | "import";
export type BudgetPeriod = "weekly" | "monthly" | "yearly";
export type GoalStatus = "active" | "completed" | "paused";
export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface Owner {
  id: string;
  telegram_id: number;
  currency: string;       // ISO 4217 e.g. "USD"
  timezone: string;       // IANA e.g. "Asia/Jakarta"
  settings: OwnerSettings;
  created_at: string;
}

export interface OwnerSettings {
  daily_digest: boolean;
  weekly_digest: boolean;
  digest_hour: number;    // 0-23 in owner's local time
  show_budget_in_summary: boolean;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  amount_base: number;    // converted to owner.currency
  category_id: string;
  description: string | null;
  date: string;           // ISO date "YYYY-MM-DD"
  source: TransactionSource;
  recurring_id: string | null;
  metadata: TransactionMetadata;
  created_at: string;
}

export interface TransactionMetadata {
  nlp_intent?: string;
  nlp_confidence?: number;
  nlp_raw?: string;
  photo_url?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: "expense" | "income" | "both";
  is_system: boolean;
  sort_order: number;
  color: string;
}

export interface Budget {
  id: string;
  category_id: string;
  amount: number;
  period: BudgetPeriod;
  alert_threshold: number;  // percent, default 80
  alerted_80_at: string | null;
  alerted_100_at: string | null;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;  // ISO date
  status: GoalStatus;
  created_at: string;
}

export interface RecurringTransaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category_id: string;
  frequency: RecurringFrequency;
  next_due_date: string;    // ISO date
  active: boolean;
  created_at: string;
}

export interface ExchangeRate {
  base_currency: string;
  target_currency: string;
  rate: number;
  fetched_at: string;
}

export interface ConversationState {
  state: string;
  context: Record<string, unknown>;
  updated_at: string;
}

// NLP parse result
export interface ParsedTransaction {
  intent: "LOG_EXPENSE" | "LOG_INCOME" | "UNKNOWN";
  amount: number;
  currency: string;
  category_hint: string | null;
  description: string | null;
  date: string;             // ISO date resolved from input
  confidence: number;       // 0.0 – 1.0
}
```

---

## 8. Database Schema

### 8.1 migrations/001_initial_schema.sql

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────
-- OWNER (single row — the developer/user)
-- ──────────────────────────────────────────
CREATE TABLE owner (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id  BIGINT      UNIQUE NOT NULL,
  currency     CHAR(3)     NOT NULL DEFAULT 'USD',
  timezone     TEXT        NOT NULL DEFAULT 'UTC',
  settings     JSONB       NOT NULL DEFAULT '{
    "daily_digest": false,
    "weekly_digest": false,
    "digest_hour": 21,
    "show_budget_in_summary": true
  }',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- CATEGORIES
-- ──────────────────────────────────────────
CREATE TABLE categories (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL,
  icon       TEXT    NOT NULL DEFAULT '💰',
  type       TEXT    NOT NULL CHECK (type IN ('expense', 'income', 'both')),
  color      CHAR(7) NOT NULL DEFAULT '#4CAF50',
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- RECURRING TRANSACTIONS (defined before transactions for FK)
-- ──────────────────────────────────────────
CREATE TABLE recurring_transactions (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  description    TEXT    NOT NULL,
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  type           TEXT    NOT NULL CHECK (type IN ('income', 'expense')),
  category_id    UUID    REFERENCES categories(id) ON DELETE SET NULL,
  frequency      TEXT    NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_due_date  DATE    NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- TRANSACTIONS
-- ──────────────────────────────────────────
CREATE TABLE transactions (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT    NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency      CHAR(3) NOT NULL,
  amount_base   NUMERIC(12, 2),   -- converted to owner.currency
  category_id   UUID    REFERENCES categories(id) ON DELETE SET NULL,
  description   TEXT,
  date          DATE    NOT NULL DEFAULT CURRENT_DATE,
  source        TEXT    NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual', 'recurring', 'import')),
  recurring_id  UUID    REFERENCES recurring_transactions(id) ON DELETE SET NULL,
  metadata      JSONB   NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- BUDGETS
-- ──────────────────────────────────────────
CREATE TABLE budgets (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      UUID    NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  period           TEXT    NOT NULL DEFAULT 'monthly'
                     CHECK (period IN ('weekly', 'monthly', 'yearly')),
  alert_threshold  INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold BETWEEN 1 AND 100),
  alerted_80_at    TIMESTAMPTZ,
  alerted_100_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, period)
);

-- ──────────────────────────────────────────
-- SAVINGS GOALS
-- ──────────────────────────────────────────
CREATE TABLE savings_goals (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT    NOT NULL,
  target_amount   NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  deadline        DATE,
  status          TEXT    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'paused')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- EXCHANGE RATE CACHE
-- ──────────────────────────────────────────
CREATE TABLE exchange_rates (
  base_currency    CHAR(3) NOT NULL,
  target_currency  CHAR(3) NOT NULL,
  rate             NUMERIC(18, 8) NOT NULL,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (base_currency, target_currency)
);
```

### 8.2 migrations/002_views.sql

```sql
-- Monthly summary (income/expense totals by category and month)
CREATE OR REPLACE VIEW monthly_summary AS
SELECT
  DATE_TRUNC('month', date)::DATE AS month,
  type,
  category_id,
  SUM(amount_base)                AS total,
  COUNT(*)                        AS txn_count
FROM transactions
GROUP BY 1, 2, 3;

-- Budget utilisation for the current calendar month
CREATE OR REPLACE VIEW budget_status AS
SELECT
  b.id,
  b.category_id,
  c.name                                              AS category_name,
  c.icon,
  b.amount                                            AS budget_amount,
  b.period,
  b.alert_threshold,
  b.alerted_80_at,
  b.alerted_100_at,
  COALESCE(SUM(t.amount_base), 0)                     AS spent,
  ROUND(
    (COALESCE(SUM(t.amount_base), 0) / b.amount) * 100
  )                                                   AS pct_used
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t
  ON  t.category_id = b.category_id
  AND t.type        = 'expense'
  AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY b.id, b.category_id, c.name, c.icon,
         b.amount, b.period, b.alert_threshold,
         b.alerted_80_at, b.alerted_100_at;
```

### 8.3 migrations/003_indexes.sql

```sql
CREATE INDEX idx_txn_date     ON transactions (date DESC);
CREATE INDEX idx_txn_category ON transactions (category_id);
CREATE INDEX idx_txn_type     ON transactions (type);
CREATE INDEX idx_txn_month    ON transactions (DATE_TRUNC('month', date));
CREATE INDEX idx_txn_source   ON transactions (source);
CREATE INDEX idx_rec_due      ON recurring_transactions (next_due_date) WHERE active = TRUE;
```

---

## 9. Bot Conversation Flows

### 9.1 Onboarding (/start)

```
STATE: idle

Bot  → "👋 Welcome to your Personal Finance Bot!
        I'll help you track every rupiah, dollar, or euro right here in Telegram.

        First — what's your preferred currency?"

Bot  → [Inline keyboard, 2 rows]
        Row 1: [🇺🇸 USD] [🇪🇺 EUR] [🇬🇧 GBP] [🇮🇩 IDR]
        Row 2: [🇸🇬 SGD] [🇲🇾 MYR] [🇯🇵 JPY] [✏️ Other]

User → taps [🇮🇩 IDR]
Bot  → "Great! Now — what's your timezone?"
Bot  → [Inline keyboard]
        [Asia/Jakarta] [Asia/Singapore] [UTC] [US/Eastern] [Europe/London] [✏️ Other]

User → taps [Asia/Jakarta]
STATE: onboarding_complete

Bot  → "✅ All set!

        📌 Quick start:
        • Type 'spent 50000 on lunch' — log an expense
        • Type 'earned 5000000 from salary' — log income
        • /summary — see this month's overview
        • /help — see all commands

        Your tracker is ready. Let's go! 🚀"

ACTION: INSERT into owner table with telegram_id, currency=IDR, timezone=Asia/Jakarta
```

### 9.2 Natural Language — Expense Logging

```
User → "kopi 15000 tadi pagi"

ACTION: NLP fast-path regex → no match
ACTION: NLP → Gemini Flash
RESULT: { intent: LOG_EXPENSE, amount: 15000, currency: IDR,
          category_hint: "food", description: "kopi", date: today, confidence: 0.91 }

Bot  → "☕ Logged!
        💸 Rp15,000 — Food & Dining
        📅 Today, May 18

        [✅ Looks good] [✏️ Edit] [🗑️ Delete]"

User → taps [✅ Looks good]
ACTION: INSERT transaction, source=manual
Bot  → "Saved! 📊 Food budget: 68% this month."
```

### 9.3 Ambiguous Input

```
User → "50000 kemarin"

Bot  → "I see Rp50,000 on May 17. Income or expense?"
        [💸 Expense] [💰 Income]

User → taps [💸 Expense]
Bot  → "Which category?"
        [🍔 Food] [🚗 Transport] [🛒 Shopping] [📱 Subscriptions]
        [🏥 Health] [🎮 Entertainment] [More ▼]

User → taps [🛒 Shopping]
Bot  → "✅ Rp50,000 — Shopping — May 17. Saved!"
```

### 9.4 Monthly Summary (/summary)

```
Bot  → "📊 May 2026 Summary

        💰 Income:      Rp5,000,000
        💸 Expenses:    Rp2,847,300
        📈 Net:         +Rp2,152,700

        ━━━ Top Spending ━━━
        🏠 Housing      Rp1,200,000 ████████░░ 42%
        🍔 Food           Rp520,500 ████░░░░░░ 18%
        🚗 Transport      Rp315,000 ██░░░░░░░░ 11%
        📱 Subscriptions  Rp187,800 █░░░░░░░░░  7%
        🎮 Entertainment  Rp175,000 █░░░░░░░░░  6%

        ━━━ Budget Status ━━━
        ⚠️  Food:        89%  (Rp520k / Rp585k)
        ✅  Transport:   72%  (Rp315k / Rp440k)

        ↑ 12% vs April

        [📄 Export CSV] [📑 Export PDF] [💡 Insights]"
```

### 9.5 Budget Alert (Automatic Push)

```
TRIGGER: BudgetService.checkAndAlert() cron (every hour)
CONDITION: pct_used >= alert_threshold AND alerted_80_at IS NULL (this period)

Bot  → "⚠️ Budget Alert — Food & Dining

        Spent:     Rp520,500
        Budget:    Rp585,000
        Remaining: Rp64,500
        Days left: 13

        [📊 View Breakdown] [🔧 Adjust Budget]"

ACTION: UPDATE budgets SET alerted_80_at = NOW() WHERE id = <budget_id>
```

### 9.6 Savings Goal List (/goal list)

```
Bot  → "🎯 Savings Goals

        💻 Laptop
        ████████░░ 80% — Rp1,200,000 / Rp1,500,000
        📅 Deadline: Dec 31, 2026 (227 days)
        💡 Need Rp300k more (~Rp43k/month)
        [➕ Add funds] [✏️ Edit] [🗑️ Delete]

        🏖️ Vacation
        ███░░░░░░░ 30% — Rp600,000 / Rp2,000,000
        📅 No deadline
        [➕ Add funds] [✏️ Edit] [🗑️ Delete]"
```

### 9.7 Recurring Auto-Log Push

```
TRIGGER: processRecurring cron (00:05 UTC daily)
CONDITION: recurring_transaction.next_due_date <= today AND active = true

Bot  → "🔄 Recurring entry processed!
        📱 Netflix — Rp249,000 — Subscriptions
        📅 Auto-logged for May 18

        [✅ OK] [✏️ Edit amount] [⏸️ Pause]"
```

### 9.8 AI Insights (/insights)

```
User → /insights

Bot  → "⏳ Generating your insights…"  ← immediate reply

ACTION: Fetch last 30 days transactions, budget status, goals
ACTION: Send to Gemini Flash with insight prompt
ACTION: Follow-up message with result

Bot  → "💡 May 2026 Spending Insights

        📈 Food spending is up 23% vs April. Most of the spike
        happened May 5–10 with several restaurant visits totalling
        Rp185,000. Cooking at home a few more times could keep
        you within budget.

        ✅ Great news on Transport — down 12% vs April. You're on
        track to stay well under your Rp440,000 budget.

        💰 At your current savings pace you'll hit your Laptop goal
        by October — 2 months ahead of your December deadline!

        ⚠️ You have 4 active subscriptions totalling Rp487,800/month.
        Worth reviewing whether all are still in use.

        [📊 View Summary] [📄 Export Report]"
```

---

## 10. Service Layer Design

### 10.1 TransactionService

```typescript
interface TransactionService {
  create(data: CreateTransactionInput): Promise<Transaction>;
  update(id: string, data: Partial<CreateTransactionInput>): Promise<Transaction>;
  delete(id: string): Promise<void>;
  getHistory(limit: number, offset?: number): Promise<Transaction[]>;
  getLastOne(): Promise<Transaction | null>;
  getSummary(period: "today" | "week" | "month", date?: string): Promise<SummaryResult>;
  getByDateRange(from: string, to: string): Promise<Transaction[]>;
  getByMonth(yearMonth: string): Promise<Transaction[]>;
}
```

### 10.2 BudgetService

```typescript
interface BudgetService {
  set(categoryId: string, amount: number, period?: BudgetPeriod): Promise<Budget>;
  delete(categoryId: string): Promise<void>;
  getStatus(): Promise<BudgetStatusRow[]>;
  checkAndAlert(): Promise<void>;  // called by cron; sends Telegram messages
  resetAlertFlags(): Promise<void>; // called on 1st of each month
}
```

### 10.3 GoalService

```typescript
interface GoalService {
  create(name: string, target: number, deadline?: string): Promise<SavingsGoal>;
  contribute(nameOrId: string, amount: number): Promise<SavingsGoal>;
  list(): Promise<SavingsGoal[]>;
  update(nameOrId: string, data: Partial<SavingsGoal>): Promise<SavingsGoal>;
  delete(nameOrId: string): Promise<void>;
  sendDeadlineReminders(): Promise<void>;  // called by cron
}
```

### 10.4 RecurringService

```typescript
interface RecurringService {
  add(data: CreateRecurringInput): Promise<RecurringTransaction>;
  list(): Promise<RecurringTransaction[]>;
  delete(id: string): Promise<void>;
  togglePause(id: string): Promise<RecurringTransaction>;
  processDue(): Promise<void>;  // called by cron; creates transactions + sends push
}
```

### 10.5 NLPService

```typescript
interface NLPService {
  parse(text: string): Promise<ParsedTransaction | null>;
  // Internal: try regex first, then Gemini, then Groq
}
```

### 10.6 InsightService

```typescript
interface InsightService {
  generate(yearMonth?: string): Promise<string>;  // returns formatted insight text
}
```

### 10.7 ReportService

```typescript
interface ReportService {
  generateCSV(from: string, to: string): Promise<Buffer>;
  generatePDF(yearMonth: string): Promise<Buffer>;
  uploadToR2(buffer: Buffer, filename: string): Promise<string>;  // returns URL
  sendToTelegram(ctx: Context, url: string, filename: string): Promise<void>;
}
```

### 10.8 CurrencyService

```typescript
interface CurrencyService {
  convert(amount: number, from: string, to: string): Promise<number>;
  refreshRates(baseCurrency: string): Promise<void>;  // called by cron
  getRate(from: string, to: string): Promise<number>;
}
```

---

## 11. Scheduled Jobs

```typescript
// src/jobs/scheduler.ts — register all jobs on startup

import cron from 'node-cron';

export function registerJobs(services: Services, bot: Telegraf): void {

  // Process recurring transactions every day at 00:05 UTC
  cron.schedule('5 0 * * *', () => services.recurring.processDue(), { timezone: 'UTC' });

  // Refresh exchange rates every day at 00:10 UTC
  cron.schedule('10 0 * * *', () => services.currency.refreshRates(ownerCurrency), { timezone: 'UTC' });

  // Check budget alerts every hour
  cron.schedule('0 * * * *', () => services.budget.checkAndAlert(), { timezone: 'UTC' });

  // Reset budget alert flags on the 1st of each month at 00:01 UTC
  cron.schedule('1 0 1 * *', () => services.budget.resetAlertFlags(), { timezone: 'UTC' });

  // Goal deadline reminders every day at 09:00 owner local time
  cron.schedule('0 9 * * *', () => services.goals.sendDeadlineReminders(), { timezone: ownerTimezone });

  // Daily digest (if opted in) — owner-configured hour, owner local time
  cron.schedule(`0 ${digestHour} * * *`, () => sendDailyDigest(services, bot), { timezone: ownerTimezone });

  // Weekly digest (if opted in) — Sunday 20:00 owner local time
  cron.schedule('0 20 * * 0', () => sendWeeklyDigest(services, bot), { timezone: ownerTimezone });
}
```

---

## 12. AI/NLP Integration

### 12.1 Two-Path Parser

```typescript
// src/services/nlp.ts

const FAST_PATH_PATTERNS = [
  // "spent 50 on lunch"  /  "paid 1200 for rent"  /  "bought coffee for 4.50"
  /^(?:spent|paid|bought|beli|bayar)\s+([\d.,]+[kK]?)\s+(?:on|for|buat)?\s*(.+)$/i,

  // "earned 3000 from salary"  /  "received 500 from freelance"  /  "got paid 2500"
  /^(?:earned|received|got paid|dapat|terima)\s+([\d.,]+[kK]?)\s*(?:from|dari)?\s*(.+)?$/i,

  // "45 groceries"  /  "15000 makan siang"  (bare amount + description)
  /^([\d.,]+[kK]?)\s+([^\d].+)$/,
];

async function parse(text: string): Promise<ParsedTransaction | null> {
  // 1. Try regex fast path (zero cost, zero latency)
  const fastResult = tryRegex(text);
  if (fastResult && fastResult.confidence >= 0.85) return fastResult;

  // 2. Try Gemini Flash
  try {
    return await callGemini(text);
  } catch (err) {
    // 3. Fallback to Groq
    return await callGroq(text);
  }
}
```

### 12.2 Gemini Prompt

```typescript
const GEMINI_SYSTEM_PROMPT = `
You are a financial transaction parser for a personal finance bot.
Extract transaction details from the user's message and return ONLY valid JSON.
Return null if the message is not a financial transaction.

Response schema (return exactly this shape or null):
{
  "intent": "LOG_EXPENSE" | "LOG_INCOME",
  "amount": number,
  "currency": string,       // ISO 4217 code, infer from symbol or context
  "category_hint": string | null,
  "description": string | null,
  "date": string,           // ISO date YYYY-MM-DD, resolve relative dates using today's date
  "confidence": number      // 0.0 to 1.0
}

Today's date: ${new Date().toISOString().split('T')[0]}
Owner's currency: ${ownerCurrency}
Owner's timezone: ${ownerTimezone}

Rules:
- "k" suffix means × 1000 (e.g. "50k" = 50000)
- Currency symbols: $ = USD, € = EUR, £ = GBP, Rp = IDR, RM = MYR
- If no currency detected, use owner's currency
- "yesterday" = today minus 1 day; "last Monday" = most recent Monday
- Set confidence < 0.80 if you are unsure of intent, amount, or date
`;
```

### 12.3 Insight Prompt

```typescript
const INSIGHT_PROMPT = (data: InsightData) => `
You are a friendly personal finance coach. Analyse the spending data below and
return 3-5 specific, actionable insights. Be conversational, not generic.
Use emojis. Keep each insight to 2-3 sentences.

Focus on:
- Unusual spending spikes vs last month
- Budget categories at risk
- Positive trends worth celebrating
- Goal progress projections
- Subscription audit opportunities

Data:
${JSON.stringify(data, null, 2)}
`;
```

### 12.4 Confidence Handling

```
confidence >= 0.85  → auto-process, show confirmation card with Edit/Delete
0.60 ≤ conf < 0.85  → show parsed result, ask "Does this look right?" + Edit button
confidence < 0.60   → ask clarifying question (expense or income? which amount?)
Gemini unavailable  → auto-fallback to Groq (transparent to user)
Both unavailable    → ask user to use /add expense or /add income guided flow
```

---

## 13. Security

### 13.1 Owner Gate Middleware

```typescript
// src/bot/middleware/ownerGate.ts
// This is the FIRST middleware in the chain. Runs before everything.

export const ownerGate: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  const ownerId = parseInt(process.env.OWNER_TELEGRAM_ID!, 10);

  if (!userId || userId !== ownerId) {
    // Silently drop — do not reply, do not log to user-facing systems
    return;
  }
  return next();
};
```

### 13.2 Webhook Signature Validation

```typescript
// src/server.ts — validate Telegram webhook secret before processing

app.post('/webhook/telegram', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.text('Forbidden', 403);
  }
  // pass to Telegraf
  await bot.handleUpdate(await c.req.json());
  return c.text('OK');
});
```

### 13.3 Secrets Management

```
- All credentials loaded from environment variables via dotenv
- No credentials in source code or git history
- .env in .gitignore — always
- .env.example committed with placeholder values only
- Fly.io secrets: set via `flyctl secrets set KEY=VALUE`
- Supabase service key has full DB access — never expose in client code
```

---

## 14. Environment Variables

```bash
# ─── TELEGRAM ───────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=           # From @BotFather — never share this
TELEGRAM_WEBHOOK_SECRET=      # Generate: openssl rand -hex 32
OWNER_TELEGRAM_ID=            # Your Telegram numeric user ID
                              # Find via @userinfobot on Telegram

# ─── DATABASE ───────────────────────────────────────────────────────────────
DATABASE_URL=                 # Supabase → Settings → Database → Connection string
SUPABASE_URL=                 # Supabase → Settings → API → Project URL
SUPABASE_SERVICE_KEY=         # Supabase → Settings → API → service_role key

# ─── CACHE ──────────────────────────────────────────────────────────────────
REDIS_URL=                    # Upstash → Connect → ioredis URL

# ─── AI ─────────────────────────────────────────────────────────────────────
GEMINI_API_KEY=               # Google AI Studio → Get API key (free)
GROQ_API_KEY=                 # console.groq.com → API Keys (free)

# ─── STORAGE ────────────────────────────────────────────────────────────────
R2_ACCOUNT_ID=                # Cloudflare dashboard → R2 → Account ID
R2_ACCESS_KEY_ID=             # Cloudflare R2 → Manage API tokens
R2_SECRET_ACCESS_KEY=         # Same as above
R2_BUCKET_NAME=financebot-exports
R2_ENDPOINT=                  # https://<ACCOUNT_ID>.r2.cloudflarestorage.com

# ─── APP ────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=3000
APP_URL=                      # https://financebot.fly.dev (set after first deploy)
LOG_LEVEL=info

# ─── MONITORING ─────────────────────────────────────────────────────────────
SENTRY_DSN=                   # Sentry → Project → Client Keys → DSN
LOGTAIL_SOURCE_TOKEN=         # Better Stack → Sources → HTTP Source token
```

---

## 15. Infrastructure & Deployment

### 15.1 Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 15.2 fly.toml

```toml
app = "financebot"
primary_region = "sin"     # Singapore — closest to Indonesia

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https   = true
  auto_stop_machines  = false   # must stay on for cron jobs
  auto_start_machines = true
  min_machines_running = 1

[env]
  NODE_ENV = "production"
  PORT     = "3000"

[[vm]]
  cpu_kind = "shared"
  cpus     = 1
  memory_mb = 256
```

### 15.3 docker-compose.yml (local development)

```yaml
version: "3.9"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      - DATABASE_URL=postgresql://postgres:localdev@db:5432/financebot
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./src:/app/src   # hot reload in dev

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: financebot
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

### 15.4 GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
name: Test & Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: testpw
          POSTGRES_DB: financebot_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test
        env:
          DATABASE_URL: postgresql://postgres:testpw@localhost:5432/financebot_test
          REDIS_URL: ""          # mocked in tests
          GEMINI_API_KEY: mock   # mocked via MSW
          GROQ_API_KEY: mock

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### 15.5 First-Time Setup Sequence (for AI Agent)

```
STEP 1  — Clone repo and run: npm install
STEP 2  — Copy .env.example to .env and fill all values
STEP 3  — Create Telegram bot via @BotFather, save token
STEP 4  — Get your Telegram user ID via @userinfobot
STEP 5  — Create Supabase project, copy URL and service_role key
STEP 6  — Create Upstash Redis database, copy ioredis URL
STEP 7  — Create Cloudflare R2 bucket named "financebot-exports"
           Set lifecycle rule: delete objects after 1 day
STEP 8  — Get Gemini API key from ai.google.dev (free, no credit card)
STEP 9  — Get Groq API key from console.groq.com (free)
STEP 10 — Run: npm run db:migrate   (creates all tables and views)
STEP 11 — Run: npm run db:seed      (inserts default categories)
STEP 12 — Deploy to Fly.io:
           flyctl launch
           flyctl secrets set TELEGRAM_BOT_TOKEN=xxx ... (all .env values)
           flyctl deploy
STEP 13 — Register webhook with Telegram:
           curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
             -d "url=https://financebot.fly.dev/webhook/telegram" \
             -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
STEP 14 — Send /start to your bot in Telegram and verify response
STEP 15 — Set up Better Stack uptime monitor for:
           https://financebot.fly.dev/health
```

---

## 16. Cost Breakdown

### 16.1 Personal Use — $0/month (forever at this scale)

```
Service                  Daily Usage                  Monthly Cost
────────────────────────────────────────────────────────────────────
Telegram Bot API         ~50 messages/day             $0   (unlimited)
Fly.io                   1 shared VM, 256 MB          $0   (free allowance)
Supabase PostgreSQL      < 5 MB data                  $0   (free: 500 MB)
Upstash Redis            < 200 requests/day            $0   (free: 10k/day)
Cloudflare R2            < 1 MB storage                $0   (free: 10 GB)
Gemini Flash             ~8,000 tokens/day             $0   (free: 1M tokens/day)
Groq                     0–5 requests/day (fallback)  $0   (free: 30 req/min)
frankfurter.app          1 request/day                 $0   (unlimited, open source)
Sentry.io                < 50 events/month             $0   (free: 5k/month)
Better Stack Logtail     < 5 MB/month                  $0   (free: 1 GB/month)
Better Stack Uptime      1 monitor                     $0   (free: 10 monitors)
GitHub Actions           < 5 min/month                 $0   (free: 2,000 min)
────────────────────────────────────────────────────────────────────
TOTAL                                                  $0/month
```

### 16.2 If You Ever Share with Others (~50 Users)

```
Service               Change Needed                  Est. Cost
──────────────────────────────────────────────────────────────
Fly.io                Upgrade to 1 dedicated VM      ~$5/month
Supabase              Still on free tier              $0
Upstash               Still on free tier              $0
Everything else       Still on free tier              $0
──────────────────────────────────────────────────────────────
TOTAL                                                ~$5/month
```

### 16.3 Token Usage vs Free Quota

```
Gemini Flash Free Quota:  1,000,000 tokens/day

Personal daily estimate:
  NLP parsing:  30 tx/day × 200 tokens = 6,000 tokens
  Insights:     1 call/day × 2,000 tokens = 2,000 tokens
  Total:        8,000 tokens/day

Usage as % of free quota:   0.8%
→ Will never exceed free tier at personal scale.
```

---

## 17. Development Phases & Milestones

> **Rule:** Phase 1 ships a complete, production-ready personal finance tracker with every core feature. You should be able to use this bot as your sole financial tracking tool immediately after Phase 1. Phases 2–4 are improvements, not missing pieces.

---

### Phase 1 — Complete Core Tracker (Weeks 1–6)

---

#### Milestone 1.1 — Foundation (Week 1)

```
□ Repo initialised: TypeScript + Node.js 20, all dependencies installed
□ Hono server starts and responds to GET /health with { status: "ok" }
□ Telegraf bot instance created with owner-gate middleware active
□ POST /webhook/telegram receives and passes updates to Telegraf
□ Supabase client connected (test: SELECT 1 succeeds)
□ All 3 SQL migration files applied (tables, views, indexes created)
□ Default categories seeded via npm run db:seed (15 expense + 6 income rows)
□ Upstash Redis connected (test: SET + GET round trip succeeds)
□ Sentry DSN wired to Hono error handler and Telegraf error handler
□ pino logger writing structured JSON to stdout
□ Docker Compose runs all 3 services (app + db + redis) locally
□ GitHub Actions pipeline: install → build → test → exits 0
□ Fly.io app created, all secrets set, first deploy live
□ Webhook registered with Telegram, verified via /getWebhookInfo
□ /ping command responds with "pong" (smoke test)
□ Unknown Telegram user sends message — bot does not respond (owner gate works)
□ README.md: setup steps 1–15 documented
```

#### Milestone 1.2 — Transaction Logging (Week 2)

```
□ /start: currency selection → timezone selection → welcome message
       → owner record saved to database
□ /help: full command list formatted as monospace table
□ /add expense: multi-step guided flow
       Step 1: ask amount    → validate numeric
       Step 2: ask category  → inline keyboard (all expense categories)
       Step 3: ask date      → [Today] [Yesterday] [Pick date]
       Step 4: ask description (optional) → [Skip]
       Step 5: show confirmation card → [✅ Save] [✏️ Edit] [🗑️ Cancel]
□ /add income: same flow with income categories
□ Confirmation card format: amount + category icon/name + date + description
□ Transaction saved to DB with correct all fields including amount_base
□ 60-second undo: after save, show [↩️ Undo] button for 60 seconds
□ /history: last 10 transactions as numbered list with short ID, amount, category, date
□ /history <N>: up to 50 transactions
□ /delete last: ask confirmation → delete → confirm "Deleted."
□ /delete <id>: same flow by short ID
□ /edit last: re-open guided flow pre-filled with existing values
□ ConversationState saved in Redis for multi-step flows; TTL = 24 hours
```

#### Milestone 1.3 — NLP Natural Language Input (Weeks 2–3)

```
□ textMessage handler registered after all command handlers
□ Regex fast-path covers all 3 patterns in Section 12.1
□ Gemini Flash API call with system prompt from Section 12.2
□ Groq auto-fallback: if Gemini throws, call Groq transparently
□ Relative date parsing: "yesterday", "kemarin", "last Monday",
       "3 days ago", "this morning" → correct ISO date
□ Currency detection: $, €, £, Rp, RM, ¥, SGD → ISO code
□ "k" suffix: "50k" → 50000, "1.5k" → 1500
□ Confidence ≥ 0.85 → auto-process, show confirmation card
□ 0.60 ≤ confidence < 0.85 → show result + "Does this look right?" + Edit
□ confidence < 0.60 → ask "Income or expense?" then category
□ NLP result stored in transaction.metadata on save
□ All 50 NLP test cases in tests/fixtures/nlpTestCases.ts pass
□ Non-financial text (e.g. "hello", "thanks") → bot ignores or shows /help tip
```

#### Milestone 1.4 — Budget System (Week 3)

```
□ /budget set <cat> <amount>: upsert budget row, confirm with current status
□ /budget set via inline keyboard (category list shown if no arg)
□ /budget status: table of all budgets using budget_status view
       Columns: icon + name | budget | spent | remaining | bar
       Progress bar: ████████░░ 80%
□ /budget delete <cat>: confirm + delete
□ BudgetService.checkAndAlert():
       Query budget_status view for pct_used >= alert_threshold
       Check alerted_80_at IS NULL for this calendar month
       Send push message (format from Section 9.5)
       UPDATE alerted_80_at = NOW()
       Same logic for 100% with alerted_100_at
□ Budget alert deduplication: alert sent at most once per period per threshold
□ Budget reset: on 1st of month cron, SET alerted_80_at = NULL, alerted_100_at = NULL
□ /summary shows budget status section at bottom (if show_budget_in_summary = true)
□ After each transaction save: inline budget status shown if category has a budget
```

#### Milestone 1.5 — Savings Goals (Weeks 3–4)

```
□ /goal set <name> <target> <date>: insert savings_goals row
□ /goal set <name> <target>: insert without deadline
□ /goal add <name> <amount>:
       UPDATE current_amount += amount
       If current_amount >= target_amount: SET status = 'completed'
       Send completion message: "🎉 Goal '[name]' reached!"
□ /goal list: all goals with:
       progress bar (████░░░░ 40%)
       amounts (current / target)
       deadline + days remaining
       "Need Rp X more (~Rp Y/month)" when deadline is set
       inline buttons: [➕ Add funds] [✏️ Edit] [🗑️ Delete]
□ /goal delete <name>: confirm + delete
□ GoalService.sendDeadlineReminders():
       Find active goals with deadline in 7 days → send "7 days left!" push
       Find active goals with deadline in 1 day  → send "Tomorrow!" push
       Dedup: use Redis key "goal_reminded:{id}:{date}" TTL 25 hours
□ Cron: runs daily at 09:00 owner local time
```

#### Milestone 1.6 — Recurring Transactions (Week 4)

```
□ /recurring add: guided multi-step flow
       Step 1: description
       Step 2: amount
       Step 3: type [💸 Expense] [💰 Income]
       Step 4: category (inline keyboard)
       Step 5: frequency [Daily] [Weekly] [Monthly] [Yearly]
       Step 6: start date [Today] [Tomorrow] [Pick date]
       Step 7: confirmation → [✅ Save] [✏️ Edit] [🗑️ Cancel]
□ /recurring list: all entries with ID, desc, amount, freq, next due date
       Inline buttons: [⏸️ Pause] [🗑️ Delete] per entry
□ /recurring delete <id>: confirm + delete
□ Pause/resume toggle: active flag; paused items shown with ⏸ in list
□ RecurringService.processDue():
       SELECT * FROM recurring_transactions WHERE next_due_date <= CURRENT_DATE AND active = true
       For each: INSERT transaction (source='recurring', recurring_id=id)
       Advance next_due_date by frequency
       Send push message (format from Section 9.7) with [✅ OK] [✏️ Edit] [⏸️ Pause]
□ Cron: runs daily at 00:05 UTC
□ Transactions created by recurring have source='recurring' and recurring_id set
```

#### Milestone 1.7 — Summary & Reports (Weeks 4–5)

```
□ /summary: current month using monthly_summary view
       Sections: income | expenses | net | top 5 categories | budget status
       Period comparison: "↑ X% vs [prior month]" (if prior month data exists)
       Net shown with ↑ (positive) or ↓ (negative) indicator
□ /summary week: Mon–Sun of current week (or Mon–today if mid-week)
□ /summary today: today's transactions list + running total
□ /summary <YYYY-MM>: any historical month
□ Progress bars rendered by formatters.ts progressBar(pct, width=10)
□ Footer buttons: [📄 Export CSV] [📑 Export PDF] [💡 Insights]
□ All monetary values formatted via currency.js with correct symbol
```

#### Milestone 1.8 — Multi-Currency (Week 5)

```
□ frankfurter.app API called in refreshRates() cron at 00:10 UTC
□ Rates stored in exchange_rates table (upsert)
□ Rates also cached in Redis key "rates:{base}" TTL 25 hours
□ CurrencyService.getRate() checks Redis first, falls back to DB
□ Every transaction INSERT: amount_base = convert(amount, currency, ownerCurrency)
□ /currency <code>: update owner.currency
       Backfill existing transactions: UPDATE amount_base for all rows
       (run as background task; send "Updating rates…" first)
□ /summary footer shows base currency symbol on all amounts
□ Currency detection in NLP: "$45" → USD, "Rp50000" → IDR
□ /settings shows current base currency
```

#### Milestone 1.9 — Export: CSV and PDF (Week 5)

```
□ ReportService.generateCSV():
       Columns: Date, Description, Category, Type, Amount, Currency, Amount (Base)
       All rows sorted by date DESC
       Special characters escaped correctly by csv-stringify
□ ReportService.generatePDF():
       Page 1: Monthly summary (income, expenses, net, period comparison)
       Page 2: Category breakdown with amounts and percentages
       Page 3: Budget status table
       Page 4: Savings goals progress
       Footer: "Generated by FinanceBot — {date}"
□ ReportService.uploadToR2(): upload Buffer, return presigned URL
□ R2 lifecycle rule: auto-delete objects older than 1 day (set in Cloudflare dashboard)
□ /export csv: immediate "⏳ Generating…" reply → upload → send as Document
□ /export csv <YYYY-MM>: filter by month
□ /export pdf: same flow
□ /export pdf <YYYY-MM>: filter by month
□ File delivered as Telegram Document (downloadable, with filename)
□ /summary footer [📄 Export CSV] button triggers export flow
```

#### Milestone 1.10 — AI Insights (Weeks 5–6)

```
□ InsightService.generate():
       Fetch: last 30 days transactions, budget_status view, savings_goals, prior month totals
       Build context object (JSON serialisable, no PII beyond amounts/categories)
       Call Gemini Flash with INSIGHT_PROMPT from Section 12.3
       Return formatted insight text (plain text with emojis, max 600 chars)
□ /insights:
       Immediate reply: "⏳ Generating your insights…"
       Follow-up message with insight text
       Footer: [📊 View Summary] [📄 Export Report]
□ Insight includes: spending anomalies, budget risks, goal projections, positive trends
□ Optional weekly insight digest (if weekly_digest = true in settings):
       Prepended to weekly digest message sent Sunday 20:00 local time
□ Groq fallback applies to insights as well
```

#### Milestone 1.11 — Settings & Custom Categories (Week 6)

```
□ /settings: show all current settings as formatted list with [Edit] buttons
       Base Currency: USD [Change]
       Timezone: Asia/Jakarta [Change]
       Daily Digest: Off [Toggle]
       Weekly Digest: Off [Toggle]
       Digest Hour: 21:00 [Change]
       Show Budget in Summary: On [Toggle]
□ Inline button handlers for each setting update owner.settings JSONB
□ /currency <code>: update currency + backfill amount_base (see 1.8)
□ /settings timezone <tz>: update timezone; validate IANA format
□ /categories: list all categories (system first, custom below, sorted by sort_order)
□ /categories add <name> <icon>: insert category (is_system = false)
       Validate: icon must be a single emoji; name max 30 chars
□ /categories delete <name>: block if any transaction references this category_id
       If no references: delete + confirm
       If references exist: "Cannot delete — used by X transactions."
□ Daily digest (if enabled): send "📅 Today: Spent Rx – Earned Ry – Net Rz" at digest_hour
□ Weekly digest (if enabled): send /summary week equivalent Sunday 20:00 local
□ All preference changes persist immediately to owner.settings
```

#### Milestone 1.12 — QA, Testing & Hardening (Week 6)

```
□ Unit tests passing: TransactionService, BudgetService, GoalService,
       RecurringService, NLPService, CurrencyService, ReportService,
       formatters.ts, dateParser.ts
□ Integration tests passing:
       Webhook → NLP → DB → Telegram reply round trip
       Budget alert cron with mocked date
       Recurring cron with mocked date (next_due_date advanced correctly)
       Export: CSV and PDF generated and > 0 bytes
       Owner gate: unknown user ID → no response
□ All 50 NLP test fixtures pass
□ Edge cases:
       Amount = 0 → rejected with friendly message
       Amount > 999,999,999 → rejected with friendly message
       Future date (> 7 days ahead) → warn "Are you sure about this date?"
       Duplicate: same amount + description + date within 5 minutes → warn "Looks like a duplicate"
□ Every command responds within 5 seconds (async reply pattern used for PDF/insights)
□ All unhandled errors caught by Telegraf error handler:
       Log to Sentry
       Reply: "⚠️ Something went wrong. Please try again."
       Never expose stack traces or raw errors to user
□ Rate limiting: if > 10 messages/minute, soft-ignore (no error reply, just drop)
□ /health endpoint returns { status: "ok", uptime: <seconds> }
□ Better Stack uptime monitor configured for /health endpoint
□ ✅ PHASE 1 COMPLETE — bot is fully usable as a daily personal finance tracker
```

---

### Phase 2 — Smart & Proactive Features (Weeks 7–9)

**Goal:** The bot anticipates needs and handles richer input formats.

```
Milestone 2.1 — Smart Nudges
□ After logging the same merchant 3+ times in a month → suggest making it recurring
  "I notice you've logged 'Netflix' 3 times. Want to make it recurring?"
□ If a category has no budget and is the top spender 2 months in a row →
  "Food is your top expense again. Want to set a budget?"
□ Goal contribution reminder if no contribution in 14 days →
  "You haven't added to your Laptop goal in 14 days. On track?"
□ End-of-month tip if under budget →
  "3 days left — you're Rp45k under your Food budget. Keep it up!"
□ Monthly spend spike alert: if category is > 30% higher than prior month →
  send proactive alert (not just in /insights)

Milestone 2.2 — Receipt Photo Scanning
□ Owner sends a photo message
□ Pass image to Gemini Flash Vision API
□ Prompt: extract merchant name, total amount, date from receipt image
□ Display result as confirmation card (same flow as NLP result)
□ Save transaction on confirmation; photo URL stored in metadata.photo_url
□ Uses Gemini Flash multimodal (same free tier, no extra cost)

Milestone 2.3 — Voice Message Input
□ Owner sends Telegram voice message (ogg/opus format)
□ Transcribe via OpenAI Whisper API (free tier: limited) or
  Groq Whisper API (free tier available)
□ Transcribed text fed into NLP pipeline
□ Confirmation card shows transcription for verification
□ Works in English and Bahasa Indonesia

Milestone 2.4 — Enhanced Insights
□ Subscription audit: flag recurring entries with no matching transaction this month
□ "Average daily spend: Rp95k vs last month's Rp82k"
□ Best/worst spending day of the week
□ Goal acceleration tip: "Cut dining by Rp50k/month to hit Laptop 6 weeks early"
```

---

### Phase 3 — Advanced Analytics & Import (Weeks 10–12)

**Goal:** Deeper analytics and the ability to bulk-import historical data.

```
Milestone 3.1 — Advanced Reports
□ /report yearly: 12-month income/expense/net table
□ /report category <name>: 30/90/180-day trend for one category
□ /report compare <YYYY-MM> <YYYY-MM>: side-by-side two-month comparison
□ Largest single transaction this month highlighted in /summary
□ Average daily spend shown in /summary week

Milestone 3.2 — Bank Statement Import
□ /import: owner sends a CSV file (bank statement)
□ Auto-detect column mapping for BCA, Mandiri, BNI, CIMB Niaga CSV formats
□ Preview: show first 5 rows + ask confirmation before bulk import
□ Duplicate detection: skip rows matching existing date + amount + description
□ Import summary: "Imported 47 transactions. Skipped 3 duplicates."

Milestone 3.3 — Net Worth Tracker
□ /networth: manually tracked assets and liabilities
□ Add asset: "savings account 5000000", "investment 2000000"
□ Add liability: "KPR loan 150000000", "credit card 2500000"
□ Net worth = total assets − total liabilities
□ Monthly snapshot auto-saved on the 1st of each month
□ /networth history: last 12 monthly snapshots as trend table
```

---

### Phase 4 — Visual Dashboard (Weeks 13+)

**Goal:** Visual charts inside Telegram without leaving the app.

```
Milestone 4.1 — Telegram Mini App Dashboard
□ React app using Telegram Web App SDK
□ Charts: monthly spending trend (line), category breakdown (pie/donut)
□ Goal progress visualisation (radial progress)
□ Filterable transaction table with search
□ Opened via inline button in /summary
□ Hosted on Cloudflare Pages (free)
□ Reads data from Supabase via service key (secure, owner-only)
□ No separate authentication needed (Telegram identity used)

Milestone 4.2 — Optional Personal Web Dashboard
□ Next.js app on Vercel free tier
□ Supabase magic-link authentication
□ Full CRUD for transactions via browser
□ All charts from 4.1 plus comparative year-over-year view
□ Only build if Telegram Mini App proves insufficient
```

---

## 18. Testing Strategy

### 18.1 Unit Tests

```
File: tests/unit/services/transaction.test.ts
  - create(): saves correct amount_base after currency conversion
  - create(): rejects amount <= 0
  - create(): rejects amount > 999999999
  - getHistory(): returns results sorted by date DESC
  - getSummary(): calculates correct income/expense/net totals

File: tests/unit/services/budget.test.ts
  - set(): upserts correctly (update if exists, insert if not)
  - checkAndAlert(): triggers at correct threshold
  - checkAndAlert(): does NOT trigger again if alerted_80_at is set this month
  - resetAlertFlags(): clears alerted_80_at and alerted_100_at

File: tests/unit/services/goal.test.ts
  - contribute(): updates current_amount correctly
  - contribute(): sets status = 'completed' when current_amount >= target_amount
  - sendDeadlineReminders(): sends alert for goals due in 7 days
  - sendDeadlineReminders(): does not send duplicate alerts (Redis dedup)

File: tests/unit/services/currency.test.ts
  - convert(): returns correct converted amount using cached rate
  - getRate(): falls back to DB when Redis misses
  - refreshRates(): stores rates in both Redis and DB

File: tests/unit/utils/dateParser.test.ts
  - "yesterday" → today - 1 day
  - "last Monday" → correct past Monday
  - "3 days ago" → today - 3 days
  - "kemarin" → today - 1 day (Bahasa Indonesia)
  - "2026-04-15" → 2026-04-15 (passthrough)

File: tests/unit/utils/formatters.test.ts
  - progressBar(80, 10) → "████████░░"
  - formatCurrency(50000, "IDR") → "Rp50,000"
  - formatCurrency(4.5, "USD") → "$4.50"
```

### 18.2 Integration Tests

```
File: tests/integration/webhook.test.ts
  - POST /webhook with wrong secret → 403
  - POST /webhook with correct secret + /ping update → bot replies "pong"
  - POST /webhook with message from unknown user → no reply (owner gate)
  - POST /webhook with "spent 50 on lunch" → transaction inserted in DB

File: tests/integration/cron.test.ts
  - processRecurring with due entry → transaction created, next_due_date advanced
  - processRecurring with future entry → nothing happens
  - checkAndAlert with 85% budget → push message sent, alerted_80_at set
  - checkAndAlert run twice → push sent only once (dedup verified)
```

### 18.3 NLP Test Fixtures

```typescript
// tests/fixtures/nlpTestCases.ts
export const nlpTestCases = [
  // English expense patterns
  { input: "spent 50 on lunch",             expect: { type: "expense", amount: 50 } },
  { input: "coffee 4.50",                   expect: { type: "expense", amount: 4.50 } },
  { input: "paid rent 1200 yesterday",      expect: { type: "expense", amount: 1200, dateOffset: -1 } },
  { input: "bought shoes for 89",           expect: { type: "expense", amount: 89 } },
  { input: "netflix 15.99",                 expect: { type: "expense", amount: 15.99 } },
  { input: "uber $12.50",                   expect: { type: "expense", amount: 12.50, currency: "USD" } },
  { input: "50k groceries",                 expect: { type: "expense", amount: 50000 } },
  { input: "paid 1.5k for electricity",     expect: { type: "expense", amount: 1500 } },
  // English income patterns
  { input: "earned 3000 from salary",       expect: { type: "income", amount: 3000 } },
  { input: "got paid 2500",                 expect: { type: "income", amount: 2500 } },
  { input: "received 500 from freelance",   expect: { type: "income", amount: 500 } },
  { input: "salary 5000000",               expect: { type: "income", amount: 5000000 } },
  // Bahasa Indonesia patterns
  { input: "kopi 15000 tadi pagi",          expect: { type: "expense", amount: 15000 } },
  { input: "beli makan 25000 kemarin",      expect: { type: "expense", amount: 25000, dateOffset: -1 } },
  { input: "bayar listrik 350000",          expect: { type: "expense", amount: 350000 } },
  { input: "Rp50000 makan siang",           expect: { type: "expense", amount: 50000, currency: "IDR" } },
  { input: "dapat gaji 5jt",               expect: { type: "income", amount: 5000000 } },
  { input: "terima 500rb dari freelance",   expect: { type: "income", amount: 500000 } },
  // Currency detection
  { input: "$45 groceries",                 expect: { currency: "USD", amount: 45 } },
  { input: "€30 dinner",                   expect: { currency: "EUR", amount: 30 } },
  { input: "£25 tube pass",                expect: { currency: "GBP", amount: 25 } },
  { input: "RM150 groceries",              expect: { currency: "MYR", amount: 150 } },
  // Relative dates
  { input: "spent 20 yesterday",           expect: { dateOffset: -1 } },
  { input: "paid 100 last monday",         expect: { dayOfWeek: "Monday" } },
  { input: "coffee 5 this morning",        expect: { dateOffset: 0 } },
  { input: "lunch 30 3 days ago",          expect: { dateOffset: -3 } },
  // Edge cases
  { input: "hello there",                  expect: null },
  { input: "how much did I spend?",        expect: null },
  { input: "thanks!",                      expect: null },
  // ... 20+ more cases covering edge cases and ambiguous inputs
];
```

### 18.4 Test Tools

```
vitest@^1.x          — test runner (fast, native TypeScript support)
supertest@^7.x       — HTTP assertion for webhook endpoint tests
msw@^2.x             — mock Gemini and Groq API calls in tests
@faker-js/faker      — generate realistic transaction test data
```

---

## 19. Future Enhancements

| Feature | Phase | Priority | Complexity |
|---|---|---|---|
| Receipt photo scanning | 2 | High | Medium |
| Voice message input | 2 | Medium | Medium |
| Smart nudges | 2 | High | Low |
| Yearly report | 3 | Medium | Low |
| Bank statement import (ID banks) | 3 | High | Medium |
| Net worth tracker | 3 | Medium | Medium |
| Telegram Mini App dashboard | 4 | Medium | High |
| Tax-deductible transaction flag | Future | Low | Low |
| Investment portfolio tracking | Future | Low | High |
| Spending predictions (ML) | Future | Low | Very High |

---

## 20. Glossary

| Term | Definition |
|---|---|
| **Bot** | The Telegram chatbot — sole interface for this personal app |
| **Owner** | The single user: the developer running this for personal use |
| **Owner Gate** | Middleware that silently drops any message not from OWNER_TELEGRAM_ID |
| **Webhook** | HTTPS endpoint (POST /webhook/telegram) that receives all Telegram updates |
| **Intent** | Classified purpose of a message: LOG_EXPENSE, LOG_INCOME, UNKNOWN, etc. |
| **Entity** | Structured value extracted from a message: amount, date, category, currency |
| **Fast-path** | Regex matching that skips AI for simple, predictable inputs (zero cost) |
| **NLP** | Natural Language Processing — converting free text into structured data |
| **LLM** | Large Language Model — Gemini Flash (primary) or Groq Llama (fallback) |
| **amount_base** | Transaction amount converted to the owner's base currency for all calculations |
| **Confidence** | NLP certainty score 0.0–1.0; < 0.80 triggers a clarification question |
| **Recurring** | A transaction template that auto-creates real transactions on a schedule |
| **Budget** | A spending ceiling per category per time period (weekly/monthly/yearly) |
| **Savings Goal** | A named target amount to accumulate, optionally by a deadline date |
| **Deduplication** | Redis-backed flag ensuring budget alerts are sent at most once per period |
| **Cron** | Scheduled background job using node-cron, runs inside the same process |
| **R2** | Cloudflare R2 — S3-compatible object storage used for CSV/PDF export files |
| **Conversation State** | Redis-stored context tracking multi-step flows (e.g. guided /add expense) |
| **PITR** | Point-In-Time Recovery — Supabase's free 7-day database backup feature |
| **TRD** | Technical Requirements Document — this file |

---

## Appendix A — Free Services Setup URLs

| Service | Purpose | Setup URL | Notes |
|---|---|---|---|
| @BotFather | Create Telegram bot, get token | t.me/BotFather | Send /newbot |
| @userinfobot | Find your Telegram numeric ID | t.me/userinfobot | Forward any message |
| Supabase | PostgreSQL database | supabase.com | Create project → copy URL + service_role key |
| Upstash | Redis cache | upstash.com | Create Redis DB → copy ioredis URL |
| Cloudflare R2 | File storage | cloudflare.com | Create R2 bucket → create API token |
| Google AI Studio | Gemini API key | aistudio.google.com | Get API key → no credit card needed |
| Groq Console | Groq fallback key | console.groq.com | Sign up → API Keys |
| Fly.io | App hosting | fly.io | Install flyctl → fly auth login |
| Sentry | Error tracking | sentry.io | Create Node.js project → copy DSN |
| Better Stack | Logs + uptime | betterstack.com | Create HTTP source → copy token |

---

*End of Technical Requirements Document*
*Personal Financial Tracker Bot — v3.0.0 FINAL — 2026-05-18*
*Platform: Telegram only. Stack: TypeScript + Node.js 20 + Telegraf + Hono + Supabase + Upstash + Fly.io*
