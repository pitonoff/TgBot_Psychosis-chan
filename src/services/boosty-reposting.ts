import { Prisma, SubscriptionTier, type BoostyPost, type TelegramChannel } from "@prisma/client";

import type { AppConfig } from "../config.js";
import { prisma } from "../db.js";
import { detectBoostyTier, parseBoostyRss } from "../boosty/rss.js";
import { TelegramPublisher } from "./telegram-publisher.js";
import { TelegramService } from "./telegram.js";

type BoostyDb = {
  boostyPost: {
    findUnique(args: { where: { externalId: string } }): Promise<BoostyPost | null>;
    create(args: {
      data: {
        externalId: string;
        title: string;
        url: string;
        publishedAt: Date;
        tier: SubscriptionTier;
        rawPayload: Prisma.InputJsonValue;
        telegramMessageId?: bigint | null;
      };
    }): Promise<BoostyPost>;
  };
  telegramChannel: {
    findFirst(args: { where: { tier: SubscriptionTier }; orderBy: { createdAt: "asc" | "desc" } }): Promise<TelegramChannel | null>;
  };
};

type BoostyPublisher = {
  publishPostToChannel(
    channelChatId: number | bigint,
    post: {
      title: string;
      excerpt?: string;
      sourceLink: string;
      imageUrl?: string;
    }
  ): Promise<number>;
};

type LoggerLike = {
  info(message: string): void;
  error(message: string): void;
};

type BoostyDeps = {
  db?: BoostyDb;
  telegram?: BoostyPublisher;
  fetchImpl?: typeof fetch;
  logger?: LoggerLike;
};

export class BoostyRepostingService {
  private readonly db: BoostyDb;
  private readonly telegram: BoostyPublisher;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: LoggerLike;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    private readonly config: AppConfig,
    deps: BoostyDeps = {}
  ) {
    this.db = deps.db ?? prisma;
    this.logger = deps.logger ?? console;
    this.telegram = deps.telegram ?? new TelegramPublisher(new TelegramService(config), this.logger);
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.config.BOOSTY_POLL_INTERVAL_SECONDS * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pollOnce() {
    if (this.inFlight) {
      return;
    }

    this.inFlight = true;

    try {
      const response = await this.fetchImpl(this.config.BOOSTY_RSS_URL);
      if (!response.ok) {
        throw new Error(`Boosty RSS fetch failed with status ${response.status}`);
      }

      const xml = await response.text();
      await this.processFeed(xml);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : "Unknown Boosty polling error");
    } finally {
      this.inFlight = false;
    }
  }

  async processFeed(xml: string) {
    const items = parseBoostyRss(xml);

    for (const item of items) {
      const existing = await this.db.boostyPost.findUnique({
        where: {
          externalId: item.externalId
        }
      });

      if (existing) {
        continue;
      }

      const tier = detectBoostyTier(item.title, item.categories, this.config.BOOSTY_DEFAULT_TIER);
      const channel = await this.getChannelForTier(tier);

      if (!channel) {
        this.logger.info(`No Telegram channel configured for tier ${tier}, skipping Boosty post ${item.externalId}`);
        continue;
      }

      const messageId = await this.telegram.publishPostToChannel(channel.chatId, {
        title: item.title,
        excerpt: item.descriptionHtml || item.excerpt,
        sourceLink: item.url,
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {})
      });

      await this.db.boostyPost.create({
        data: {
          externalId: item.externalId,
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          tier,
          rawPayload: item.rawPayload as Prisma.InputJsonValue,
          telegramMessageId: BigInt(messageId)
        }
      });
    }
  }

  private async getChannelForTier(tier: SubscriptionTier) {
    return this.db.telegramChannel.findFirst({
      where: {
        tier
      },
      orderBy: {
        createdAt: "asc"
      }
    });
  }
}
