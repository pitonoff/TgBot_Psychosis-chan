import sensible from "@fastify/sensible";
import Fastify from "fastify";

import { getConfig, type AppConfig } from "./config.js";
import { prisma } from "./db.js";
import { createLogger } from "./logger.js";
import { healthRoute } from "./routes/health.js";
import { createTelegramWebhookRoute } from "./routes/telegram-webhook.js";

export async function buildApp(config: AppConfig = getConfig()) {
  const app = Fastify({
    logger: createLogger(config)
  });

  await app.register(sensible);
  await app.register(healthRoute);
  await app.register(createTelegramWebhookRoute(config));

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
