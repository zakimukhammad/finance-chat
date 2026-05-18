# Personal Financial Tracker Bot

A personal Telegram bot that tracks income, expenses, budgets, savings goals, and recurring transactions. Natural language input is parsed by AI. Summaries, alerts, and exports are delivered inside Telegram.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Telegram account

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repo-url>
   cd financebot
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Fill in all values in .env
   ```

3. **Get your credentials:**
   - **Telegram Bot Token:** Create a bot via [@BotFather](https://t.me/BotFather) → `/newbot`
   - **Your Telegram ID:** Send any message to [@userinfobot](https://t.me/userinfobot)
   - **Supabase:** Create project at [supabase.com](https://supabase.com) → copy URL + service_role key
   - **Upstash Redis:** Create DB at [upstash.com](https://upstash.com) → copy ioredis URL
   - **Gemini API Key:** Get at [aistudio.google.com](https://aistudio.google.com) (free)
   - **Groq API Key:** Get at [console.groq.com](https://console.groq.com) (free)
   - **Cloudflare R2:** Create bucket `financebot-exports` at [cloudflare.com](https://cloudflare.com)

4. **Run database migrations:**
   ```bash
   npm run db:migrate
   ```

5. **Seed default categories:**
   ```bash
   npm run db:seed
   ```

6. **Start development server:**
   ```bash
   npm run dev
   ```

### Deployment (Fly.io)

```bash
flyctl launch
flyctl secrets set TELEGRAM_BOT_TOKEN=xxx SUPABASE_URL=xxx ...
flyctl deploy
```

Register webhook:
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://financebot.fly.dev/webhook/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### Docker (Local Development)

```bash
docker-compose up
```

Runs: App + PostgreSQL 15 + Redis 7

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20 LTS |
| Bot Framework | Telegraf |
| Web Server | Hono |
| Database | Supabase (PostgreSQL 15) |
| Cache | Upstash Redis |
| File Storage | Cloudflare R2 |
| AI/NLP | Google Gemini Flash + Groq (fallback) |
| Hosting | Fly.io |

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Onboarding |
| `/help` | Show all commands |
| `/add expense` | Guided expense entry |
| `/add income` | Guided income entry |
| `/history` | View recent transactions |
| `/summary` | Monthly overview |
| `/budget set <cat> <amt>` | Set budget |
| `/budget status` | View budgets |
| `/goal set <name> <target>` | Create savings goal |
| `/export csv` | Export as CSV |
| `/export pdf` | Export as PDF |
| `/insights` | AI spending analysis |

Or just type naturally: `spent 50 on lunch`, `earned 3000 from salary`

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

## License

ISC
