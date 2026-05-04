import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { prisma } from "../db.js";
import { AccessService } from "../services/access.js";
import type { BoostyRepostingService } from "../services/boosty-reposting.js";

const userParamsSchema = z.object({
  id: z.string().min(1)
});

export function createAdminRoute(
  config: AppConfig,
  deps: {
    boostyRepostingService: BoostyRepostingService;
  }
): FastifyPluginAsync {
  return async (app) => {
    const accessService = new AccessService(config, {
      logger: {
        info: (message) => app.log.info(message)
      }
    });

    app.addHook("onRequest", async (request, reply) => {
      const tokenHeader = request.headers["x-admin-token"];
      const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

      if (token !== config.ADMIN_API_TOKEN) {
        return reply.code(401).send({
          ok: false,
          error: "Unauthorized"
        });
      }
    });

    app.get("/admin/users/:id", async (request, reply) => {
      const { id } = userParamsSchema.parse(request.params);

      const user = await prisma.user.findUnique({
        where: {
          id
        },
        include: {
          subscriptions: {
            orderBy: {
              createdAt: "desc"
            }
          },
          inviteLinks: {
            orderBy: {
              createdAt: "desc"
            },
            include: {
              channel: true
            }
          }
        }
      });

      if (!user) {
        return reply.code(404).send({
          ok: false,
          error: "User not found"
        });
      }

      return reply.send({
        ok: true,
        data: {
          id: user.id,
          telegramId: user.telegramId?.toString() ?? null,
          telegramUsername: user.telegramUsername,
          email: user.email,
          tributeCustomerId: user.tributeCustomerId,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
          subscriptions: user.subscriptions.map((subscription) => ({
            id: subscription.id,
            provider: subscription.provider,
            providerSubscriptionId: subscription.providerSubscriptionId,
            tier: subscription.tier,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
            createdAt: subscription.createdAt.toISOString(),
            updatedAt: subscription.updatedAt.toISOString()
          })),
          inviteLinks: user.inviteLinks.map((inviteLink) => ({
            id: inviteLink.id,
            inviteLink: inviteLink.inviteLink,
            expiresAt: inviteLink.expiresAt.toISOString(),
            createsJoinRequest: inviteLink.createsJoinRequest,
            usedAt: inviteLink.usedAt?.toISOString() ?? null,
            createdAt: inviteLink.createdAt.toISOString(),
            channel: {
              id: inviteLink.channel.id,
              tier: inviteLink.channel.tier,
              chatId: inviteLink.channel.chatId.toString(),
              title: inviteLink.channel.title
            }
          }))
        }
      });
    });

    app.post("/admin/users/:id/sync-access", async (request, reply) => {
      const { id } = userParamsSchema.parse(request.params);
      const result = await accessService.syncUserAccess(id);

      return reply.send({
        ok: true,
        data: result
      });
    });

    app.post("/admin/boosty/poll-now", async (_request, reply) => {
      await deps.boostyRepostingService.pollOnce();

      return reply.send({
        ok: true,
        data: {
          triggered: true
        }
      });
    });

    app.get("/admin/subscriptions", async (_request, reply) => {
      const subscriptions = await prisma.subscription.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

      return reply.send({
        ok: true,
        data: subscriptions.map((subscription) => ({
          id: subscription.id,
          userId: subscription.userId,
          provider: subscription.provider,
          providerSubscriptionId: subscription.providerSubscriptionId,
          tier: subscription.tier,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          createdAt: subscription.createdAt.toISOString(),
          updatedAt: subscription.updatedAt.toISOString()
        }))
      });
    });

    app.get("/admin/webhook-events", async (_request, reply) => {
      const events = await prisma.webhookEvent.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

      return reply.send({
        ok: true,
        data: events.map((event) => ({
          id: event.id,
          provider: event.provider,
          eventId: event.eventId,
          payload: event.payload,
          processedAt: event.processedAt?.toISOString() ?? null,
          createdAt: event.createdAt.toISOString()
        }))
      });
    });
  };
}
