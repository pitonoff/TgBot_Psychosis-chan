import { SubscriptionStatus, SubscriptionTier, type InviteLink, type TelegramChannel } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../src/config.js";
import { AccessService } from "../src/services/access.js";

const baseConfig: AppConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3000,
  LOG_LEVEL: "silent",
  DATABASE_URL: "https://example.com/postgres",
  TELEGRAM_BOT_TOKEN: "123456:token",
  TELEGRAM_WEBHOOK_SECRET: "super-secret-token",
  TELEGRAM_CHANNEL_ID: BigInt(-1001234567890),
  TELEGRAM_STARS_PRICE: 100,
  TELEGRAM_INVITE_LINK_EXPIRE_HOURS: 24,
  TRIBUTE_WEBHOOK_SECRET: "tribute-secret-123",
  ADMIN_API_TOKEN: "admin-secret-token",
  BOOSTY_RSS_URL: "https://example.com/rss.xml",
  BOOSTY_POLL_INTERVAL_SECONDS: 300,
  BOOSTY_DEFAULT_TIER: SubscriptionTier.basic
};

const channels: TelegramChannel[] = [
  {
    id: "basic-channel",
    tier: SubscriptionTier.basic,
    chatId: BigInt(-1001),
    title: "Basic",
    createdAt: new Date("2024-01-01T00:00:00.000Z")
  },
  {
    id: "premium-channel",
    tier: SubscriptionTier.premium,
    chatId: BigInt(-1002),
    title: "Premium",
    createdAt: new Date("2024-01-02T00:00:00.000Z")
  },
  {
    id: "vip-channel",
    tier: SubscriptionTier.vip,
    chatId: BigInt(-1003),
    title: "VIP",
    createdAt: new Date("2024-01-03T00:00:00.000Z")
  }
];

function createInvite(channelId: string, inviteLink: string, expiresAt = new Date("2025-01-02T00:00:00.000Z")): InviteLink {
  return {
    id: `invite-${channelId}`,
    userId: "user-1",
    channelId,
    inviteLink,
    expiresAt,
    createsJoinRequest: false,
    usedAt: null,
    createdAt: new Date("2025-01-01T00:00:00.000Z")
  };
}

type ChannelInvite = InviteLink & { channel: TelegramChannel };

function createService(options?: {
  userTelegramId?: bigint | null;
  subscriptions?: Array<{ tier: SubscriptionTier }>;
  existingChannelInvites?: ChannelInvite[];
  freshInvitesByChannelId?: Record<string, InviteLink | null>;
}) {
  const telegram = {
    createSingleUseInviteLink: vi.fn(async (chatId: bigint) => ({
      invite_link: `https://t.me/join/${chatId.toString()}`
    })),
    removeUserFromChat: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {})
  };

  const inviteLinkCreate = vi.fn(
    async ({
      data
    }: {
      data: {
        userId: string;
        channelId: string;
        inviteLink: string;
        expiresAt: Date;
        createsJoinRequest: boolean;
      };
    }) => ({
      ...data,
      id: `created-${data.channelId}`,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      usedAt: null
    })
  );

  const db = {
    user: {
      findUnique: vi.fn(async () => ({
        id: "user-1",
        telegramId: options?.userTelegramId ?? BigInt(777)
      }))
    },
    subscription: {
      findMany: vi.fn(async () => options?.subscriptions ?? [])
    },
    telegramChannel: {
      findMany: vi.fn(
        async ({
          where
        }: {
          where: { tier: SubscriptionTier } | { tier: { in: SubscriptionTier[] } };
        }) => {
          const tierFilter = where.tier;

          if (typeof tierFilter === "object" && "in" in tierFilter) {
            return channels.filter((channel) => tierFilter.in.includes(channel.tier));
          }

          return channels.filter((channel) => channel.tier === tierFilter);
        }
      )
    },
    inviteLink: {
      findFirst: vi.fn(
        async ({
          where
        }: {
          where: {
            userId: string;
            channelId: string;
            usedAt: null;
            expiresAt: { gt: Date };
          };
        }) => {
          const freshInvite = options?.freshInvitesByChannelId?.[where.channelId];
          return freshInvite ?? null;
        }
      ),
      findMany: vi.fn(async () => options?.existingChannelInvites ?? []),
      create: inviteLinkCreate,
      updateMany: vi.fn(async () => ({ count: 1 }))
    }
  };

  const service = new AccessService(baseConfig, {
    db,
    telegram,
    now: () => new Date("2025-01-01T00:00:00.000Z"),
    logger: {
      info: vi.fn()
    }
  });

  return { service, db, telegram, inviteLinkCreate };
}

describe("AccessService", () => {
  it("computes inherited tier access", () => {
    const { service } = createService();

    expect(service.getAllowedTiers(SubscriptionTier.basic)).toEqual([SubscriptionTier.basic]);
    expect(service.getAllowedTiers(SubscriptionTier.premium)).toEqual([
      SubscriptionTier.basic,
      SubscriptionTier.premium
    ]);
    expect(service.getAllowedTiers(SubscriptionTier.vip)).toEqual([
      SubscriptionTier.basic,
      SubscriptionTier.premium,
      SubscriptionTier.vip
    ]);
  });

  it("returns all channels allowed for a tier", async () => {
    const { service } = createService();

    const result = await service.getChannelsForTier(SubscriptionTier.premium);

    expect(result.map((channel) => channel.id)).toEqual(["basic-channel", "premium-channel"]);
  });

  it("grants one-time invite links for all allowed channels and sends them to Telegram", async () => {
    const { service, telegram, inviteLinkCreate } = createService();

    const invites = await service.grantAccess("user-1", SubscriptionTier.premium);

    expect(invites).toHaveLength(2);
    expect(inviteLinkCreate).toHaveBeenCalledTimes(2);
    expect(telegram.createSingleUseInviteLink).toHaveBeenCalledTimes(2);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("syncs access by revoking disallowed channels and granting missing inherited channels", async () => {
    const staleVipInvite = {
      ...createInvite("vip-channel", "https://t.me/join/vip"),
      channel: channels[2]!
    } satisfies ChannelInvite;
    const freshBasicInvite = {
      ...createInvite("basic-channel", "https://t.me/join/basic"),
      channel: channels[0]!
    } satisfies ChannelInvite;

    const { service, telegram, inviteLinkCreate, db } = createService({
      subscriptions: [{ tier: SubscriptionTier.premium }],
      existingChannelInvites: [staleVipInvite, freshBasicInvite],
      freshInvitesByChannelId: {
        "basic-channel": createInvite("basic-channel", "https://t.me/join/basic")
      }
    });

    const result = await service.syncUserAccess("user-1");

    expect(result.activeSubscriptionCount).toBe(1);
    expect(result.revokedChannels).toBe(1);
    expect(result.allowedTiers).toEqual([SubscriptionTier.basic, SubscriptionTier.premium]);
    expect(telegram.removeUserFromChat).toHaveBeenCalledTimes(1);
    expect(inviteLinkCreate).toHaveBeenCalledTimes(1);
    expect(db.inviteLink.updateMany).toHaveBeenCalled();
  });
});
