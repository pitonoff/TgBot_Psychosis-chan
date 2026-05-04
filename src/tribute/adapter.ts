import { SubscriptionStatus, SubscriptionTier } from "@prisma/client";

import type { TributeWebhookPayload } from "./schema.js";

export type NormalizedTributeEvent = {
  eventId: string;
  type: TributeWebhookPayload["type"];
  customerId: string;
  email?: string;
  subscriptionId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd?: Date;
};

export function normalizeTributePayload(payload: TributeWebhookPayload): NormalizedTributeEvent {
  const customerId = payload.data.customer?.id ?? payload.data.customerId;
  const email = payload.data.customer?.email ?? payload.data.email;
  const subscriptionId = payload.data.subscription?.id ?? payload.data.subscriptionId;
  const tier = payload.data.subscription?.tier ?? payload.data.tier;
  const status = payload.data.subscription?.status ?? payload.data.status ?? deriveStatusFromEvent(payload.type);
  const currentPeriodEnd = payload.data.subscription?.currentPeriodEnd ?? payload.data.currentPeriodEnd;

  if (!customerId) {
    throw new Error("Tribute payload is missing customer id");
  }

  if (!subscriptionId) {
    throw new Error("Tribute payload is missing subscription id");
  }

  if (!tier) {
    throw new Error("Tribute payload is missing subscription tier");
  }

  return {
    eventId: payload.id,
    type: payload.type,
    customerId,
    subscriptionId,
    tier,
    status,
    ...(email !== undefined ? { email } : {}),
    ...(currentPeriodEnd ? { currentPeriodEnd: toDate(currentPeriodEnd) } : {})
  };
}

function deriveStatusFromEvent(type: TributeWebhookPayload["type"]): SubscriptionStatus {
  switch (type) {
    case "subscription.cancelled":
      return SubscriptionStatus.canceled;
    case "subscription.expired":
      return SubscriptionStatus.expired;
    case "payment.failed":
      return SubscriptionStatus.past_due;
    case "subscription.created":
    case "subscription.renewed":
    case "subscription.updated":
    case "payment.succeeded":
      return SubscriptionStatus.active;
  }
}

function toDate(value: string | number | Date) {
  return value instanceof Date ? value : new Date(value);
}
