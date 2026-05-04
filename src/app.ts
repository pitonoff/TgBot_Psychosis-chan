import sensible from "@fastify/sensible";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";

import { getConfig, type AppConfig } from "./config.js";
import { prisma } from "./db.js";
import { createLogger } from "./logger.js";
import { healthRoute } from "./routes/health.js";
import { createTelegramWebhookRoute } from "./routes/telegram-webhook.js";
import { createTributeWebhookRoute } from "./routes/tribute-webhook.js";

export async function buildApp(config: AppConfig = getConfig()) {
  const app = Fastify({
    logger: createLogger(config)
  });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (request: FastifyRequest, body, done) => {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");
    request.rawBody = rawBody;

    try {
      const parsed = rawBody.length > 0 ? JSON.parse(rawBody) : {};
      done(null, parsed);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await app.register(sensible);
  await app.register(healthRoute);
  await app.register(createTelegramWebhookRoute(config));
  await app.register(createTributeWebhookRoute(config));

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
