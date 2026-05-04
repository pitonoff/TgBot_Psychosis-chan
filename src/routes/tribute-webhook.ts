import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";

import type { AppConfig } from "../config.js";
import { normalizeTributePayload } from "../tribute/adapter.js";
import { tributeWebhookSchema } from "../tribute/schema.js";
import { verifyTributeSignature } from "../tribute/signature.js";
import { TributeWebhookService } from "../services/tribute-webhook.js";

export function createTributeWebhookRoute(config: AppConfig): FastifyPluginAsync {
  return async (app) => {
    const tributeWebhookService = new TributeWebhookService(config);

    app.post("/webhooks/tribute", async (request, reply) => {
      const signatureHeader = request.headers["x-tribute-signature"];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
      const rawBody = request.rawBody ?? "";

      if (!verifyTributeSignature(rawBody, signature, config.TRIBUTE_WEBHOOK_SECRET)) {
        return reply.code(401).send({
          ok: false,
          error: "Unauthorized"
        });
      }

      try {
        const payload = tributeWebhookSchema.parse(request.body);
        const normalized = normalizeTributePayload(payload);
        const result = await tributeWebhookService.processEvent(normalized, payload);

        return reply.code(200).send({
          ok: true,
          ignored: result.alreadyProcessed
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            ok: false,
            error: "Invalid payload"
          });
        }

        if (error instanceof Error && error.message.startsWith("Tribute payload")) {
          return reply.code(400).send({
            ok: false,
            error: error.message
          });
        }

        throw error;
      }
    });
  };
}
