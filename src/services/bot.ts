import { AccessGrantStatus, PaymentStatus } from "@prisma/client";

import type { AppConfig } from "../config.js";
import { prisma } from "../db.js";
import { TelegramService } from "./telegram.js";
import type { TelegramPreCheckoutQuery, TelegramUpdate, TelegramUser } from "../telegram/types.js";

export class BotService {
  private readonly telegram: TelegramService;

  constructor(private readonly config: AppConfig) {
    this.telegram = new TelegramService(config);
  }

  async handleUpdate(update: TelegramUpdate) {
    if (update.pre_checkout_query) {
      await this.handlePreCheckoutQuery(update.pre_checkout_query);
      return;
    }

    if (update.message?.successful_payment && update.message.from) {
      await this.handleSuccessfulPayment(update);
      return;
    }

    if (update.message?.text === "/start" && update.message.from) {
      await this.handleStart(update.message.from, update.message.chat.id);
    }
  }

  private async handleStart(user: TelegramUser, chatId: number) {
    await this.upsertUser(user);

    await this.telegram.sendMessage(
      chatId,
      [
        "Welcome to the paid channel access bot.",
        `The current access price is ${this.config.TELEGRAM_STARS_PRICE} Stars.`,
        "Once Telegram confirms payment, I will send you a one-time invite link to the private channel."
      ].join("\n")
    );
  }

  private async handlePreCheckoutQuery(query: TelegramPreCheckoutQuery) {
    await this.upsertUser(query.from);

    await prisma.payment.upsert({
      where: {
        invoicePayload: query.invoice_payload
      },
      update: {
        amount: query.total_amount,
        currency: query.currency,
        status: PaymentStatus.PENDING
      },
      create: {
        userId: (await this.findUserIdByTelegramId(query.from.id))!,
        provider: "telegram",
        invoicePayload: query.invoice_payload,
        currency: query.currency,
        amount: query.total_amount,
        status: PaymentStatus.PENDING
      }
    });

    await this.telegram.answerPreCheckoutQuery(query.id, true);
  }

  private async handleSuccessfulPayment(update: TelegramUpdate) {
    const message = update.message;
    const user = message?.from;
    const payment = message?.successful_payment;

    if (!message || !user || !payment) {
      return;
    }

    await this.upsertUser(user);
    const userId = (await this.findUserIdByTelegramId(user.id))!;

    const existingGrant = await prisma.accessGrant.findUnique({
      where: {
        invoicePayload: payment.invoice_payload
      }
    });

    if (existingGrant?.inviteLink) {
      await prisma.payment.upsert({
        where: {
          invoicePayload: payment.invoice_payload
        },
        update: {
          status: PaymentStatus.PAID,
          telegramChargeId: payment.telegram_payment_charge_id,
          telegramTransactionId: payment.provider_payment_charge_id,
          rawUpdate: update,
          confirmedAt: new Date()
        },
        create: {
          userId,
          provider: "telegram",
          invoicePayload: payment.invoice_payload,
          currency: payment.currency,
          amount: payment.total_amount,
          status: PaymentStatus.PAID,
          telegramChargeId: payment.telegram_payment_charge_id,
          telegramTransactionId: payment.provider_payment_charge_id,
          rawUpdate: update,
          confirmedAt: new Date()
        }
      });

      await this.telegram.sendMessage(
        message.chat.id,
        `Payment already confirmed. Here is your private channel invite link:\n${existingGrant.inviteLink}`
      );
      return;
    }

    const invite = await this.telegram.createSingleUseInviteLink(user.id);

    await prisma.$transaction([
      prisma.payment.upsert({
        where: {
          invoicePayload: payment.invoice_payload
        },
        update: {
          status: PaymentStatus.PAID,
          telegramChargeId: payment.telegram_payment_charge_id,
          telegramTransactionId: payment.provider_payment_charge_id,
          rawUpdate: update,
          confirmedAt: new Date()
        },
        create: {
          userId,
          provider: "telegram",
          invoicePayload: payment.invoice_payload,
          currency: payment.currency,
          amount: payment.total_amount,
          status: PaymentStatus.PAID,
          telegramChargeId: payment.telegram_payment_charge_id,
          telegramTransactionId: payment.provider_payment_charge_id,
          rawUpdate: update,
          confirmedAt: new Date()
        }
      }),
      prisma.accessGrant.upsert({
        where: {
          invoicePayload: payment.invoice_payload
        },
        update: {
          status: AccessGrantStatus.ACTIVE,
          inviteLink: invite.invite_link,
          inviteLinkName: invite.name,
          grantedAt: new Date(),
          expiresAt: this.calculateInviteExpiry(),
          revokedAt: null
        },
        create: {
          userId,
          invoicePayload: payment.invoice_payload,
          status: AccessGrantStatus.ACTIVE,
          inviteLink: invite.invite_link,
          inviteLinkName: invite.name,
          grantedAt: new Date(),
          expiresAt: this.calculateInviteExpiry()
        }
      })
    ]);

    await this.telegram.sendMessage(
      message.chat.id,
      `Payment confirmed. Here is your private channel invite link:\n${invite.invite_link}`
    );
  }

  private calculateInviteExpiry() {
    return new Date(Date.now() + this.config.TELEGRAM_INVITE_LINK_EXPIRE_HOURS * 60 * 60 * 1000);
  }

  private async upsertUser(user: TelegramUser) {
    await prisma.user.upsert({
      where: {
        telegramUserId: BigInt(user.id)
      },
      update: {
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        languageCode: user.language_code,
        isBot: user.is_bot
      },
      create: {
        telegramUserId: BigInt(user.id),
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        languageCode: user.language_code,
        isBot: user.is_bot
      }
    });
  }

  private async findUserIdByTelegramId(telegramUserId: number) {
    const user = await prisma.user.findUnique({
      where: {
        telegramUserId: BigInt(telegramUserId)
      },
      select: {
        id: true
      }
    });

    return user?.id;
  }
}
