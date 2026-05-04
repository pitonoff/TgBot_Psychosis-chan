# Telegram Paid-Channel Access Bot Backend

Production-ready TypeScript Node.js backend for a Telegram paid-channel access bot using Fastify, PostgreSQL, Prisma, Pino, Zod, Vitest, Docker, and `pnpm`.

## Requirements

- Node.js 22+
- `pnpm`
- Docker with Docker Compose

## Setup

```bash
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

The API will start on `http://localhost:3000`.

Before using the bot flow, fill in the Telegram settings in `.env`:

- `TELEGRAM_BOT_TOKEN` - your BotFather token
- `TELEGRAM_WEBHOOK_SECRET` - secret matched against `x-telegram-bot-api-secret-token`
- `TELEGRAM_STARS_PRICE` - access price used in bot messaging
- `TELEGRAM_INVITE_LINK_EXPIRE_HOURS` - one-time invite link TTL
- `TELEGRAM_BASIC_CHANNEL_CHAT_ID`, `TELEGRAM_PREMIUM_CHANNEL_CHAT_ID`, `TELEGRAM_VIP_CHANNEL_CHAT_ID` - your private channel chat IDs
- `TRIBUTE_WEBHOOK_SECRET` - webhook signature secret for Tribute
- `ADMIN_API_TOKEN` - shared secret for the internal admin API
- `BOOSTY_RSS_URL` - Boosty RSS feed URL
- `BOOSTY_POLL_INTERVAL_SECONDS` - RSS polling interval
- `BOOSTY_DEFAULT_TIER` - fallback tier for Boosty posts with no marker

## Available Scripts

- `pnpm dev` - run the Fastify server in watch mode
- `pnpm build` - compile TypeScript into `dist/`
- `pnpm start` - start the compiled server
- `pnpm test` - run Vitest
- `pnpm lint` - run ESLint
- `pnpm prisma:generate` - generate the Prisma client
- `pnpm prisma:migrate` - create/apply local development migrations
- `pnpm prisma:deploy` - apply committed Prisma migrations in production

## Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "ok": true }
```

## Telegram Webhook

```bash
curl -X POST http://localhost:3000/telegram/webhook \
  -H "content-type: application/json" \
  -H "x-telegram-bot-api-secret-token: your-secret" \
  -d '{"update_id":1}'
```

Expected response:

```json
{ "ok": true }
```

The backend currently handles:

- `POST /telegram/webhook`
- `/start` messages
- `pre_checkout_query` confirmation
- `successful_payment` updates
- One-time invite link creation for the configured Telegram channel

## Docker

```bash
cp .env.example .env
docker compose up --build
```

This starts:

- `postgres` - PostgreSQL 16
- `migrate` - one-shot Prisma migration runner
- `app` - production Fastify service with container healthcheck

The application is reachable at `http://localhost:3000` after migrations complete.

## Production Checklist

### 1. Create Telegram Bot

1. Open BotFather in Telegram.
2. Run `/newbot`.
3. Save the bot token into `TELEGRAM_BOT_TOKEN`.

### 2. Add Bot To Private Channels

1. Create or choose your private Telegram channels for `basic`, `premium`, and `vip`.
2. Add the bot as an admin to each private channel.
3. Grant permission to invite users and manage members.

### 3. Configure Channel Chat IDs

1. Get each private channel chat ID. For private channels it usually looks like `-100...`.
2. Insert matching `TelegramChannel` rows in PostgreSQL for each tier.
3. Keep the tier-to-channel mapping aligned with:
   - `basic`
   - `premium`
   - `vip`
4. Store the raw IDs in `.env` for operational reference:
   - `TELEGRAM_BASIC_CHANNEL_CHAT_ID`
   - `TELEGRAM_PREMIUM_CHANNEL_CHAT_ID`
   - `TELEGRAM_VIP_CHANNEL_CHAT_ID`

### 4. Configure Tribute Webhook

1. Expose your app publicly over HTTPS.
2. Set the Tribute webhook URL to:

```text
https://your-domain.example/webhooks/tribute
```

3. Set `TRIBUTE_WEBHOOK_SECRET` to the same secret configured in Tribute.

### 5. Configure Boosty RSS

1. Copy your Boosty RSS feed URL into `BOOSTY_RSS_URL`.
2. Set `BOOSTY_POLL_INTERVAL_SECONDS` to the desired polling interval.
3. Set `BOOSTY_DEFAULT_TIER` for posts without `[basic]`, `[premium]`, or `[vip]` markers.

### 6. Run Migrations

For local development:

```bash
pnpm prisma:migrate
```

For Docker production startup:

```bash
docker compose up --build
```

The `migrate` service runs `pnpm prisma:deploy` automatically before the app starts.

## Project Structure

```text
src/
  app.ts
  config.ts
  db.ts
  logger.ts
  routes/
    admin.ts
    health.ts
    telegram-webhook.ts
    tribute-webhook.ts
  services/
    access.ts
    bot.ts
    boosty-reposting.ts
    telegram.ts
    telegram-publisher.ts
    tribute-webhook.ts
  server.ts
  boosty/
    rss.ts
  telegram/
    schema.ts
    types.ts
  tribute/
    adapter.ts
    schema.ts
    signature.ts
prisma/
  schema.prisma
test/
  access.service.test.ts
  boosty-reposting.test.ts
  health.test.ts
  telegram-publisher.test.ts
```
