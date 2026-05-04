import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  const appPromise = buildApp({
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 3000,
    LOG_LEVEL: "silent",
    DATABASE_URL: "https://example.com/postgres"
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
});
