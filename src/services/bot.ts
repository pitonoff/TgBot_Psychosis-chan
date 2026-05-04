import type { AppConfig } from "../config.js";
import { prisma } from "../db.js";
import type { TelegramUpdate, TelegramUser } from "../telegram/types.js";
import { AccessService } from "./access.js";
import { TelegramService } from "./telegram.js";

export class BotService {
  private readonly accessService: AccessService;
  private readonly telegram: TelegramService;

  constructor(private readonly config: AppConfig) {
    this.accessService = new AccessService(config);
    this.telegram = new TelegramService(config);
  }

  async handleUpdate(update: TelegramUpdate) {
    if (update.message?.text === "/start" && update.message.from) {
      await this.handleStart(update.message.from, update.message.chat.id);
    }
  }

  private async handleStart(user: TelegramUser, chatId: number) {
    const savedUser = await this.upsertUser(user);
    const syncResult = await this.accessService.syncUserAccess(savedUser.id);

    if (syncResult.activeSubscriptionCount === 0) {
      await this.telegram.sendMessage(
        chatId,
        "Telegram linked. We do not see an active Tribute subscription yet."
      );
      return;
    }

    if (syncResult.grantedInvites === 0) {
      await this.telegram.sendMessage(chatId, "Telegram linked and subscription found. Active access is synchronized.");
    }
  }

  private async upsertUser(user: TelegramUser) {
    return prisma.user.upsert({
      where: {
        telegramId: BigInt(user.id)
      },
      update: {
        ...(user.username !== undefined ? { telegramUsername: user.username } : {})
      },
      create: {
        telegramId: BigInt(user.id),
        ...(user.username !== undefined ? { telegramUsername: user.username } : {})
      }
    });
  }
}
