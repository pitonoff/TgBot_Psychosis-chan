import sensible from "@fastify/sensible";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";

import { getConfig, type AppConfig } from "./config.js";
import { prisma } from "./db.js";
import { createLogger } from "./logger.js";
import { createAdminRoute } from "./routes/admin.js";
import { healthRoute } from "./routes/health.js";
import { createTelegramWebhookRoute } from "./routes/telegram-webhook.js";
import { createTributeWebhookRoute } from "./routes/tribute-webhook.js";
import { BoostyRepostingService } from "./services/boosty-reposting.js";

export async function buildApp(config: AppConfig = getConfig()) {
  const logger = createLogger(config);
  const app = Fastify({
    logger
  });
  const boostyRepostingService = new BoostyRepostingService(config, {
    logger: {
      info: (message) => logger.info(message),
      error: (message) => logger.error(message)
    }
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
  await app.register(createAdminRoute(config, { boostyRepostingService }));

  boostyRepostingService.start();

  app.addHook("onClose", async () => {
    boostyRepostingService.stop();
    await prisma.$disconnect();
  });

  return app;
}
