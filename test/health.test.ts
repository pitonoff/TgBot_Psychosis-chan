import { createHmac } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { verifyTributeSignature } from "../src/tribute/signature.js";

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
    TELEGRAM_INVITE_LINK_EXPIRE_HOURS: 24,
    TRIBUTE_WEBHOOK_SECRET: "tribute-secret-123",
    ADMIN_API_TOKEN: "admin-secret-token",
    BOOSTY_RSS_URL: "https://example.com/rss.xml",
    BOOSTY_POLL_INTERVAL_SECONDS: 300,
    BOOSTY_DEFAULT_TIER: "basic"
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

  it("rejects tribute webhook requests with an invalid signature", async () => {
    const app = await appPromise;

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/tribute",
      headers: {
        "content-type": "application/json",
        "x-tribute-signature": "bad-signature"
      },
      payload: JSON.stringify({
        id: "evt_1",
        type: "subscription.created",
        data: {}
      })
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      ok: false,
      error: "Unauthorized"
    });
  });

  it("verifies tribute signatures with hmac sha256", () => {
    const rawBody = JSON.stringify({
      id: "evt_1",
      type: "subscription.created",
      data: {}
    });

    const signature = createHmac("sha256", "tribute-secret-123").update(rawBody).digest("hex");

    expect(verifyTributeSignature(rawBody, signature, "tribute-secret-123")).toBe(true);
    expect(verifyTributeSignature(rawBody, `sha256=${signature}`, "tribute-secret-123")).toBe(true);
    expect(verifyTributeSignature(rawBody, undefined, "tribute-secret-123")).toBe(false);
  });

  it("rejects unauthorized admin API access", async () => {
    const app = await appPromise;

    const routes = [
      { method: "GET" as const, url: "/admin/users/test-user" },
      { method: "POST" as const, url: "/admin/users/test-user/sync-access" },
      { method: "POST" as const, url: "/admin/boosty/poll-now" },
      { method: "GET" as const, url: "/admin/subscriptions" },
      { method: "GET" as const, url: "/admin/webhook-events" }
    ];

    for (const route of routes) {
      const response = await app.inject(route);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        ok: false,
        error: "Unauthorized"
      });
    }
  });
});
