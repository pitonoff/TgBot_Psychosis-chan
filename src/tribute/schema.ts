import { z } from "zod";

const tributeTierSchema = z.enum(["basic", "premium", "vip"]);
const tributeStatusSchema = z.enum(["active", "past_due", "canceled", "expired"]);

const tributeCustomerSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  email: z.string().email().optional()
});

const tributeSubscriptionSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  tier: tributeTierSchema.optional(),
  status: tributeStatusSchema.optional(),
  currentPeriodEnd: z.union([z.string(), z.number(), z.date()]).optional()
});

export const tributeWebhookSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  type: z.enum([
    "subscription.created",
    "subscription.renewed",
    "subscription.updated",
    "subscription.cancelled",
    "subscription.expired",
    "payment.succeeded",
    "payment.failed"
  ]),
  data: z.object({
    customer: tributeCustomerSchema.optional(),
    subscription: tributeSubscriptionSchema.optional(),
    customerId: z.union([z.string(), z.number()]).transform(String).optional(),
    email: z.string().email().optional(),
    subscriptionId: z.union([z.string(), z.number()]).transform(String).optional(),
    tier: tributeTierSchema.optional(),
    status: tributeStatusSchema.optional(),
    currentPeriodEnd: z.union([z.string(), z.number(), z.date()]).optional()
  })
});

export type TributeWebhookPayload = z.infer<typeof tributeWebhookSchema>;
