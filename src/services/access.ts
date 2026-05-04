import { SubscriptionStatus, SubscriptionTier, type InviteLink, type TelegramChannel, type User } from "@prisma/client";

import { type AppConfig } from "../config.js";
import { prisma } from "../db.js";
import { TelegramService } from "./telegram.js";

const TIER_ACCESS_ORDER: Record<SubscriptionTier, SubscriptionTier[]> = {
  [SubscriptionTier.basic]: [SubscriptionTier.basic],
  [SubscriptionTier.premium]: [SubscriptionTier.basic, SubscriptionTier.premium],
  [SubscriptionTier.vip]: [SubscriptionTier.basic, SubscriptionTier.premium, SubscriptionTier.vip]
};

type AccessDb = {
  user: {
    findUnique(args: {
      where: { id: string };
    }): Promise<Pick<User, "id" | "telegramId"> | null>;
  };
  subscription: {
    findMany(args: {
      where: { userId: string; status: SubscriptionStatus };
      select: { tier: true };
    }): Promise<Array<{ tier: SubscriptionTier }>>;
  };
  telegramChannel: {
    findMany(args: {
      where: { tier: SubscriptionTier } | { tier: { in: SubscriptionTier[] } };
      orderBy?: { createdAt: "asc" | "desc" };
    }): Promise<TelegramChannel[]>;
  };
  inviteLink: {
    findFirst(args: {
      where: {
        userId: string;
        channelId: string;
        usedAt: null;
        expiresAt: { gt: Date };
      };
      orderBy: { createdAt: "desc" };
    }): Promise<InviteLink | null>;
    findMany(args: {
      where: {
        userId: string;
      };
      include: {
        channel: true;
      };
    }): Promise<Array<InviteLink & { channel: TelegramChannel }>>;
    create(args: {
      data: {
        userId: string;
        channelId: string;
        inviteLink: string;
        expiresAt: Date;
        createsJoinRequest: boolean;
      };
    }): Promise<InviteLink>;
    updateMany(args: {
      where: {
        userId: string;
        channelId: string;
        usedAt: null;
      };
      data: {
        usedAt: Date;
      };
    }): Promise<unknown>;
  };
};

type TelegramGateway = {
  createSingleUseInviteLink(chatId: bigint, memberUserId: number, createsJoinRequest?: boolean): Promise<{
    invite_link: string;
    name?: string;
  }>;
  removeUserFromChat(chatId: bigint, userId: bigint): Promise<void>;
  sendMessage(chatId: number | bigint, text: string): Promise<unknown>;
};

type LoggerLike = {
  info(message: string): void;
};

type AccessServiceDeps = {
  db?: AccessDb;
  telegram?: TelegramGateway;
  now?: () => Date;
  logger?: LoggerLike;
};

export class AccessService {
  private readonly db: AccessDb;
  private readonly telegram: TelegramGateway;
  private readonly now: () => Date;
  private readonly logger: LoggerLike;

  constructor(
    private readonly config: AppConfig,
    deps: AccessServiceDeps = {}
  ) {
    this.db = deps.db ?? prisma;
    this.telegram = deps.telegram ?? new TelegramService(config);
    this.now = deps.now ?? (() => new Date());
    this.logger = deps.logger ?? console;
  }

  getAllowedTiers(tier: SubscriptionTier) {
    return [...TIER_ACCESS_ORDER[tier]];
  }

  async getChannelsForTier(tier: SubscriptionTier) {
    return this.db.telegramChannel.findMany({
      where: {
        tier: {
          in: this.getAllowedTiers(tier)
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });
  }

  async grantAccess(userId: string, tier: SubscriptionTier) {
    const user = await this.db.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.telegramId) {
      this.logger.info(`Telegram linking pending for user ${userId}`);
      return [];
    }

    const channels = await this.getChannelsForTier(tier);
    const activeInvites: InviteLink[] = [];
    const newInvites: InviteLink[] = [];

    for (const channel of channels) {
      const existingInvite = await this.db.inviteLink.findFirst({
        where: {
          userId,
          channelId: channel.id,
          usedAt: null,
          expiresAt: {
            gt: this.now()
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      if (existingInvite) {
        activeInvites.push(existingInvite);
        continue;
      }

      const invite = await this.telegram.createSingleUseInviteLink(channel.chatId, Number(user.telegramId));
      const expiresAt = new Date(this.now().getTime() + 24 * 60 * 60 * 1000);
      const savedInvite = await this.db.inviteLink.create({
        data: {
          userId,
          channelId: channel.id,
          inviteLink: invite.invite_link,
          expiresAt,
          createsJoinRequest: false
        }
      });

      activeInvites.push(savedInvite);
      newInvites.push(savedInvite);
    }

    if (newInvites.length > 0) {
      const message = [
        "Your Telegram channel invite links are ready:",
        ...newInvites.map((invite) => invite.inviteLink)
      ].join("\n");

      await this.telegram.sendMessage(user.telegramId, message);
    }

    return activeInvites;
  }

  async revokeAccess(userId: string, tier: SubscriptionTier) {
    const user = await this.db.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.telegramId) {
      return 0;
    }

    const channels = await this.getChannelsForTier(tier);

    for (const channel of channels) {
      await this.telegram.removeUserFromChat(channel.chatId, user.telegramId);
      await this.db.inviteLink.updateMany({
        where: {
          userId,
          channelId: channel.id,
          usedAt: null
        },
        data: {
          usedAt: this.now()
        }
      });
    }

    return channels.length;
  }

  async syncUserAccess(userId: string) {
    const user = await this.db.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const activeSubscriptions = await this.db.subscription.findMany({
      where: {
        userId,
        status: SubscriptionStatus.active
      },
      select: {
        tier: true
      }
    });

    const allowedTiers = new Set<SubscriptionTier>();
    for (const subscription of activeSubscriptions) {
      for (const tier of this.getAllowedTiers(subscription.tier)) {
        allowedTiers.add(tier);
      }
    }

    const allowedTierList = [...allowedTiers];
    const allowedChannels =
      allowedTierList.length > 0
        ? await this.db.telegramChannel.findMany({
            where: {
              tier: {
                in: allowedTierList
              }
            },
            orderBy: {
              createdAt: "asc"
            }
          })
        : [];

    const existingInvites = await this.db.inviteLink.findMany({
      where: {
        userId
      },
      include: {
        channel: true
      }
    });

    const allowedChannelIds = new Set(allowedChannels.map((channel) => channel.id));
    const activeInviteChannelIds = new Set(
      existingInvites
        .filter((invite) => invite.usedAt === null && invite.expiresAt > this.now())
        .map((invite) => invite.channelId)
    );

    let revokedChannels = 0;

    if (user.telegramId) {
      const channelsToRevoke = new Map<string, TelegramChannel>();

      for (const invite of existingInvites) {
        if (!allowedChannelIds.has(invite.channelId)) {
          channelsToRevoke.set(invite.channel.id, invite.channel);
        }
      }

      for (const channel of channelsToRevoke.values()) {
        await this.telegram.removeUserFromChat(channel.chatId, user.telegramId);
        await this.db.inviteLink.updateMany({
          where: {
            userId,
            channelId: channel.id,
            usedAt: null
          },
          data: {
            usedAt: this.now()
          }
        });
      }

      revokedChannels = channelsToRevoke.size;
    }

    let grantedInvites = 0;

    if (activeSubscriptions.length > 0 && user.telegramId) {
      for (const subscription of activeSubscriptions) {
        const before = activeInviteChannelIds.size;
        const invites = await this.grantAccess(userId, subscription.tier);

        for (const invite of invites) {
          activeInviteChannelIds.add(invite.channelId);
        }

        grantedInvites += activeInviteChannelIds.size - before;
      }
    } else if (activeSubscriptions.length > 0) {
      this.logger.info(`Telegram linking pending for user ${userId}`);
    }

    return {
      activeSubscriptionCount: activeSubscriptions.length,
      grantedInvites,
      revokedChannels,
      allowedTiers: allowedTierList
    };
  }
}
