# Telegram Paid-Channel Access Bot Backend

Production-ready TypeScript Node.js backend scaffold for a Telegram paid-channel access bot using Fastify, PostgreSQL, Prisma, Pino, Zod, Vitest, Docker, and `pnpm`.

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

## Available Scripts

- `pnpm dev` - run the Fastify server in watch mode
- `pnpm build` - compile TypeScript into `dist/`
- `pnpm start` - start the compiled server
- `pnpm test` - run Vitest
- `pnpm lint` - run ESLint
- `pnpm prisma:generate` - generate the Prisma client
- `pnpm prisma:migrate` - create/apply local development migrations

## Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "ok": true }
```

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
  logger.ts
  routes/
    health.ts
  server.ts
prisma/
  schema.prisma
test/
  health.test.ts
```
