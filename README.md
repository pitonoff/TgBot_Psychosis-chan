# Telegram Paid-Channel Access Bot Backend

Production-ready TypeScript Node.js backend for a Telegram paid-channel access bot.

Stack:

- Node.js 22
- TypeScript
- Fastify
- PostgreSQL
- Prisma
- pnpm
- Docker / Docker Compose
- Zod
- Pino
- Vitest

Current features:

- Telegram webhook endpoint
- Tribute webhook receiver with signature verification and idempotency
- Tier-based Telegram access sync (`basic`, `premium`, `vip`)
- Boosty RSS reposting to Telegram channels
- Internal admin API protected by token
- Dockerized production setup with migration service

Verified locally in this repo:

- `npm test` -> 16 tests passed
- `npm run build` -> passed

---

## English

### Overview

This service manages paid access to private Telegram channels.

It supports:

- user linking via Telegram `/start`
- subscription sync from Tribute webhooks
- Telegram invite link creation and revocation by tier
- Boosty RSS reposting into tier-specific Telegram channels
- internal admin routes for manual sync and operations

### Tier Policy

- `basic` gets access to `basic`
- `premium` gets access to `basic` + `premium`
- `vip` gets access to `basic` + `premium` + `vip`

### Main HTTP Routes

Public routes:

- `GET /health`
- `POST /telegram/webhook`
- `POST /webhooks/tribute`

Internal admin routes:

- `GET /admin/users/:id`
- `POST /admin/users/:id/sync-access`
- `POST /admin/boosty/poll-now`
- `GET /admin/subscriptions`
- `GET /admin/webhook-events`

Admin authentication:

- header: `x-admin-token`
- value: `ADMIN_API_TOKEN`

### Environment Variables

Runtime:

- `NODE_ENV`
- `HOST`
- `PORT`
- `LOG_LEVEL`

Database:

- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Telegram:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_STARS_PRICE`
- `TELEGRAM_INVITE_LINK_EXPIRE_HOURS`
- `TELEGRAM_CHANNEL_ID`
- `TELEGRAM_BASIC_CHANNEL_CHAT_ID`
- `TELEGRAM_PREMIUM_CHANNEL_CHAT_ID`
- `TELEGRAM_VIP_CHANNEL_CHAT_ID`

Tribute:

- `TRIBUTE_WEBHOOK_SECRET`

Admin API:

- `ADMIN_API_TOKEN`

Boosty:

- `BOOSTY_RSS_URL`
- `BOOSTY_POLL_INTERVAL_SECONDS`
- `BOOSTY_DEFAULT_TIER`

See [.env.example](/Users/alexandermoshnitsky/code/TgBot_Psychosis-chan/.env.example) for a complete template.

### Local Development

```bash
cp .env.example .env
npm install
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate dev
npm test
npm run build
```

If you use `pnpm` locally:

```bash
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm test
pnpm dev
```

### Docker Production Start

The main production entrypoint is:

```bash
cp .env.example .env
docker compose up --build
```

This starts:

- `postgres` - PostgreSQL 16
- `migrate` - one-shot Prisma migration runner
- `app` - production Fastify app

The app container:

- uses a multi-stage Docker build
- uses `pnpm` through `corepack`
- runs as a non-root user
- exposes a container healthcheck

### Production Setup Guide

#### 1. Create Telegram Bot

1. Open BotFather in Telegram.
2. Run `/newbot`.
3. Save the token into `TELEGRAM_BOT_TOKEN`.

#### 2. Create Private Channels

Create three private channels, one per tier:

- `basic`
- `premium`
- `vip`

#### 3. Add Bot As Admin

Add the bot as administrator to each private channel and allow it to:

- invite users
- manage members

This is required for invite link issuance and access revocation.

#### 4. Get Telegram Channel Chat IDs

Each private channel needs its own `chat_id`, typically in the form `-100...`.

Store them in `.env` for reference:

- `TELEGRAM_BASIC_CHANNEL_CHAT_ID`
- `TELEGRAM_PREMIUM_CHANNEL_CHAT_ID`
- `TELEGRAM_VIP_CHANNEL_CHAT_ID`

Also create matching `TelegramChannel` rows in PostgreSQL with the correct tier mapping.

#### 5. Configure Telegram Webhook

Expose the app over HTTPS and configure Telegram to call:

```text
https://your-domain.example/telegram/webhook
```

Use the same secret value in:

- Telegram webhook setup
- `TELEGRAM_WEBHOOK_SECRET`

#### 6. Configure Tribute Webhook

In Tribute, set the webhook URL to:

```text
https://your-domain.example/webhooks/tribute
```

Use the same secret value in:

- Tribute webhook configuration
- `TRIBUTE_WEBHOOK_SECRET`

#### 7. Configure Boosty RSS

Set:

- `BOOSTY_RSS_URL`
- `BOOSTY_POLL_INTERVAL_SECONDS`
- `BOOSTY_DEFAULT_TIER`

Tier detection rules for Boosty reposts:

- title or category contains `[basic]` -> `basic`
- title or category contains `[premium]` -> `premium`
- title or category contains `[vip]` -> `vip`
- otherwise -> `BOOSTY_DEFAULT_TIER`

#### 8. Run Migrations

For Docker startup, migrations run automatically via the `migrate` service.

For manual local execution:

```bash
pnpm prisma:migrate
```

### Useful Commands

```bash
pnpm dev
pnpm build
pnpm start
pnpm test
pnpm lint
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:deploy
```

### Example Checks

Health:

```bash
curl http://localhost:3000/health
```

Admin API:

```bash
curl -H "x-admin-token: your-admin-token" \
  http://localhost:3000/admin/subscriptions
```

### Project Structure

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

---

## Русский

### Обзор

Это backend-сервис для управления платным доступом в приватные Telegram-каналы.

Он умеет:

- связывать пользователя через Telegram `/start`
- принимать вебхуки Tribute
- синхронизировать доступ по тиру
- создавать и отзывать Telegram invite links
- репостить Boosty RSS-посты в Telegram-каналы по тиру
- отдавать внутренний admin API для ручных операций

### Политика доступа по тирам

- `basic` получает доступ только в `basic`
- `premium` получает доступ в `basic` и `premium`
- `vip` получает доступ в `basic`, `premium` и `vip`

### Основные HTTP маршруты

Публичные маршруты:

- `GET /health`
- `POST /telegram/webhook`
- `POST /webhooks/tribute`

Внутренние admin-маршруты:

- `GET /admin/users/:id`
- `POST /admin/users/:id/sync-access`
- `POST /admin/boosty/poll-now`
- `GET /admin/subscriptions`
- `GET /admin/webhook-events`

Авторизация admin API:

- заголовок: `x-admin-token`
- значение: `ADMIN_API_TOKEN`

### Переменные окружения

Runtime:

- `NODE_ENV`
- `HOST`
- `PORT`
- `LOG_LEVEL`

База данных:

- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Telegram:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_STARS_PRICE`
- `TELEGRAM_INVITE_LINK_EXPIRE_HOURS`
- `TELEGRAM_CHANNEL_ID`
- `TELEGRAM_BASIC_CHANNEL_CHAT_ID`
- `TELEGRAM_PREMIUM_CHANNEL_CHAT_ID`
- `TELEGRAM_VIP_CHANNEL_CHAT_ID`

Tribute:

- `TRIBUTE_WEBHOOK_SECRET`

Admin API:

- `ADMIN_API_TOKEN`

Boosty:

- `BOOSTY_RSS_URL`
- `BOOSTY_POLL_INTERVAL_SECONDS`
- `BOOSTY_DEFAULT_TIER`

Полный шаблон смотрите в [.env.example](/Users/alexandermoshnitsky/code/TgBot_Psychosis-chan/.env.example).

### Локальная разработка

```bash
cp .env.example .env
npm install
./node_modules/.bin/prisma generate
./node_modules/.bin/prisma migrate dev
npm test
npm run build
```

Если работаете через `pnpm`:

```bash
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm test
pnpm dev
```

### Production-запуск через Docker

Основной способ запуска:

```bash
cp .env.example .env
docker compose up --build
```

Поднимутся сервисы:

- `postgres` - PostgreSQL 16
- `migrate` - one-shot Prisma migration runner
- `app` - production Fastify приложение

Контейнер приложения:

- собирается multi-stage Dockerfile
- использует `pnpm` через `corepack`
- запускается не от root
- имеет healthcheck

### Пошаговая production-настройка

#### 1. Создайте Telegram-бота

1. Откройте BotFather.
2. Выполните `/newbot`.
3. Сохраните токен в `TELEGRAM_BOT_TOKEN`.

#### 2. Создайте приватные каналы

Создайте три приватных канала:

- `basic`
- `premium`
- `vip`

#### 3. Добавьте бота админом

Добавьте бота администратором в каждый приватный канал и дайте ему права:

- приглашать пользователей
- управлять участниками

Это необходимо для выдачи invite links и отзыва доступа.

#### 4. Получите `chat_id` каналов

Для каждого приватного канала нужен свой `chat_id`, обычно формата `-100...`.

Сохраните их в `.env`:

- `TELEGRAM_BASIC_CHANNEL_CHAT_ID`
- `TELEGRAM_PREMIUM_CHANNEL_CHAT_ID`
- `TELEGRAM_VIP_CHANNEL_CHAT_ID`

И обязательно создайте соответствующие записи `TelegramChannel` в PostgreSQL с правильным tier mapping.

#### 5. Настройте Telegram webhook

Приложение должно быть доступно по HTTPS. Укажите webhook Telegram:

```text
https://your-domain.example/telegram/webhook
```

Одинаковый секрет должен совпадать в:

- настройке webhook Telegram
- `TELEGRAM_WEBHOOK_SECRET`

#### 6. Настройте Tribute webhook

В Tribute укажите URL:

```text
https://your-domain.example/webhooks/tribute
```

Одинаковый секрет должен совпадать в:

- настройке Tribute
- `TRIBUTE_WEBHOOK_SECRET`

#### 7. Настройте Boosty RSS

Заполните:

- `BOOSTY_RSS_URL`
- `BOOSTY_POLL_INTERVAL_SECONDS`
- `BOOSTY_DEFAULT_TIER`

Правила определения tier для Boosty:

- в title или category есть `[basic]` -> `basic`
- в title или category есть `[premium]` -> `premium`
- в title или category есть `[vip]` -> `vip`
- иначе используется `BOOSTY_DEFAULT_TIER`

#### 8. Примените миграции

При запуске через Docker миграции применяются автоматически сервисом `migrate`.

Для ручного локального запуска:

```bash
pnpm prisma:migrate
```

### Полезные команды

```bash
pnpm dev
pnpm build
pnpm start
pnpm test
pnpm lint
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:deploy
```

### Примеры запросов

Проверка здоровья:

```bash
curl http://localhost:3000/health
```

Пример admin API:

```bash
curl -H "x-admin-token: your-admin-token" \
  http://localhost:3000/admin/subscriptions
```
