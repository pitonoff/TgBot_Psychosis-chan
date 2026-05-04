import sensible from "@fastify/sensible";
import Fastify from "fastify";

import { getConfig, type AppConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { healthRoute } from "./routes/health.js";

export async function buildApp(config: AppConfig = getConfig()) {
  const app = Fastify({
    logger: createLogger(config)
  });

  await app.register(sensible);
  await app.register(healthRoute);

  return app;
}
