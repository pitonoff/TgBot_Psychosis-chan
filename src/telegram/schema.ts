import { z } from "zod";

export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      chat: z.object({
        id: z.number(),
        type: z.string()
      }),
      from: z
        .object({
          id: z.number(),
          is_bot: z.boolean(),
          first_name: z.string(),
          last_name: z.string().optional(),
          username: z.string().optional(),
          language_code: z.string().optional()
        })
        .optional(),
      text: z.string().optional(),
      successful_payment: z
        .object({
          currency: z.string(),
          total_amount: z.number().int(),
          invoice_payload: z.string(),
          telegram_payment_charge_id: z.string(),
          provider_payment_charge_id: z.string()
        })
        .optional()
    })
    .optional(),
  pre_checkout_query: z
    .object({
      id: z.string(),
      currency: z.string(),
      total_amount: z.number().int(),
      invoice_payload: z.string(),
      from: z.object({
        id: z.number(),
        is_bot: z.boolean(),
        first_name: z.string(),
        last_name: z.string().optional(),
        username: z.string().optional(),
        language_code: z.string().optional()
      })
    })
    .optional()
});
