import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  const appPromise = buildApp({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 3000,
    LOG_LEVEL: "silent",
    DATABASE_URL: "https://example.com/postgres",
    TELEGRAM_BOT_TOKEN: "123456:token",
    TELEGRAM_WEBHOOK_SECRET: "super-secret-token",
    TELEGRAM_CHANNEL_ID: BigInt(-1001234567890),
    TELEGRAM_STARS_PRICE: 100,
    TELEGRAM_INVITE_LINK_EXPIRE_HOURS: 24
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it("returns ok", async () => {
    const app = await appPromise;

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("rejects telegram webhook requests with an invalid secret", async () => {
    const app = await appPromise;

    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: {
        update_id: 1
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      ok: false,
      error: "Unauthorized"
    });
  });
});
