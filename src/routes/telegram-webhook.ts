import type { FastifyPluginAsync } from "fastify";

import type { AppConfig } from "../config.js";
import { BotService } from "../services/bot.js";
import { telegramUpdateSchema } from "../telegram/schema.js";

export function createTelegramWebhookRoute(config: AppConfig): FastifyPluginAsync {
  return async (app) => {
    const botService = new BotService(config);

    app.post("/telegram/webhook", async (request, reply) => {
      const secret = request.headers["x-telegram-bot-api-secret-token"];

      if (secret !== config.TELEGRAM_WEBHOOK_SECRET) {
        return reply.code(401).send({
          ok: false,
          error: "Unauthorized"
        });
      }

      const update = telegramUpdateSchema.parse(request.body);

      await botService.handleUpdate(update);

      return reply.code(200).send({
        ok: true
      });
    });
  };
}
