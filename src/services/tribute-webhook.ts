import { Prisma, SubscriptionProvider, SubscriptionStatus, WebhookProvider } from "@prisma/client";

import type { AppConfig } from "../config.js";
import { prisma } from "../db.js";
import type { NormalizedTributeEvent } from "../tribute/adapter.js";
import { AccessService } from "./access.js";

export class TributeWebhookService {
  private readonly accessService: AccessService;

  constructor(private readonly config: AppConfig) {
    this.accessService = new AccessService(config);
  }

  async processEvent(event: NormalizedTributeEvent, payload: unknown) {
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: WebhookProvider.tribute,
          eventId: event.eventId,
          payload: payload as Prisma.InputJsonValue
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { alreadyProcessed: true } as const;
      }

      throw error;
    }

    const user = await prisma.user.upsert({
      where: {
        tributeCustomerId: event.customerId
      },
      update: {
        ...(event.email !== undefined ? { email: event.email } : {})
      },
      create: {
        tributeCustomerId: event.customerId,
        ...(event.email !== undefined ? { email: event.email } : {})
      }
    });

    const subscription = await prisma.subscription.upsert({
      where: {
        providerSubscriptionId: event.subscriptionId
      },
      update: {
        provider: SubscriptionProvider.tribute,
        tier: event.tier,
        status: event.status,
        userId: user.id,
        ...(event.currentPeriodEnd !== undefined ? { currentPeriodEnd: event.currentPeriodEnd } : {})
      },
      create: {
        userId: user.id,
        provider: SubscriptionProvider.tribute,
        providerSubscriptionId: event.subscriptionId,
        tier: event.tier,
        status: event.status,
        ...(event.currentPeriodEnd !== undefined ? { currentPeriodEnd: event.currentPeriodEnd } : {})
      }
    });

    if (
      event.status === SubscriptionStatus.active ||
      event.status === SubscriptionStatus.canceled ||
      event.status === SubscriptionStatus.expired ||
      event.status === SubscriptionStatus.past_due
    ) {
      await this.accessService.syncUserAccess(user.id);
    }

    await prisma.webhookEvent.update({
      where: {
        provider_eventId: {
          provider: WebhookProvider.tribute,
          eventId: event.eventId
        }
      },
      data: {
        processedAt: new Date()
      }
    });

    return { alreadyProcessed: false } as const;
  }
}
