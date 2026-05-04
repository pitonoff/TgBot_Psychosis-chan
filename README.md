# Telegram Paid-Channel Access Bot Backend

Production-ready TypeScript Node.js backend scaffold for a Telegram paid-channel access bot using Fastify, PostgreSQL, Prisma, Pino, Zod, Vitest, Docker, and `pnpm`.

It includes a Telegram webhook endpoint, bot/payment domain models, and automatic one-time invite-link issuance after a confirmed payment update.

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
- `TELEGRAM_CHANNEL_ID` - target paid/private channel id, usually like `-100...`
- `TELEGRAM_STARS_PRICE` - access price used in bot messaging
- `TELEGRAM_INVITE_LINK_EXPIRE_HOURS` - one-time invite link TTL

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

## Project Structure

```text
src/
  app.ts
  config.ts
  db.ts
  logger.ts
  routes/
    health.ts
    telegram-webhook.ts
  services/
    bot.ts
    telegram.ts
  server.ts
  telegram/
    schema.ts
    types.ts
prisma/
  schema.prisma
test/
  health.test.ts
```
