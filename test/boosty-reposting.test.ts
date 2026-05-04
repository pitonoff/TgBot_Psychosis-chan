import { Prisma, SubscriptionTier, type BoostyPost, type TelegramChannel } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../src/config.js";
import { detectBoostyTier } from "../src/boosty/rss.js";
import { BoostyRepostingService } from "../src/services/boosty-reposting.js";

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
  BOOSTY_RSS_URL: "https://example.com/rss.xml",
  BOOSTY_POLL_INTERVAL_SECONDS: 300,
  BOOSTY_DEFAULT_TIER: SubscriptionTier.basic
};

const premiumChannel: TelegramChannel = {
  id: "premium-channel",
  tier: SubscriptionTier.premium,
  chatId: BigInt(-1002),
  title: "Premium",
  createdAt: new Date("2024-01-01T00:00:00.000Z")
};

const basicChannel: TelegramChannel = {
  id: "basic-channel",
  tier: SubscriptionTier.basic,
  chatId: BigInt(-1001),
  title: "Basic",
  createdAt: new Date("2024-01-01T00:00:00.000Z")
};

function createDb(existingPost: BoostyPost | null = null) {
  type CreateBoostyPostInput = {
    externalId: string;
    title: string;
    url: string;
    publishedAt: Date;
    tier: SubscriptionTier;
    rawPayload: Prisma.InputJsonValue;
    telegramMessageId?: bigint | null;
  };

  return {
    boostyPost: {
      findUnique: vi.fn(async () => existingPost),
      create: vi.fn(async ({ data }: { data: CreateBoostyPostInput }) => ({
        id: "boosty-post-1",
        externalId: data.externalId,
        title: data.title,
        url: data.url,
        publishedAt: data.publishedAt,
        tier: data.tier,
        rawPayload: data.rawPayload as Prisma.JsonValue,
        telegramMessageId: data.telegramMessageId ?? null,
        createdAt: new Date("2025-01-01T00:00:00.000Z")
      }))
    },
    telegramChannel: {
      findFirst: vi.fn(
        async ({ where }: { where: { tier: SubscriptionTier } }) =>
          where.tier === SubscriptionTier.premium ? premiumChannel : basicChannel
      )
    }
  };
}

describe("Boosty tier detection", () => {
  it("detects explicit markers from title or categories", () => {
    expect(detectBoostyTier("New post [basic]", [], SubscriptionTier.vip)).toBe(SubscriptionTier.basic);
    expect(detectBoostyTier("New post", ["[premium]"], SubscriptionTier.basic)).toBe(SubscriptionTier.premium);
    expect(detectBoostyTier("[vip] Insider", [], SubscriptionTier.basic)).toBe(SubscriptionTier.vip);
  });

  it("falls back to the configured default tier", () => {
    expect(detectBoostyTier("No marker", ["general"], SubscriptionTier.premium)).toBe(SubscriptionTier.premium);
  });
});

describe("BoostyRepostingService duplicate prevention", () => {
  it("publishes new RSS items and stores telegram message id", async () => {
    const db = createDb();
    const telegram = {
      publishPostToChannel: vi.fn(async () => 42)
    };

    const service = new BoostyRepostingService(baseConfig, {
      db,
      telegram,
      logger: {
        info: vi.fn(),
        error: vi.fn()
      }
    });

    await service.processFeed(`
      <rss>
        <channel>
          <item>
            <guid>post-1</guid>
            <title>[premium] Launch</title>
            <link>https://boosty.example/posts/1</link>
            <description><![CDATA[<p>Big update for premium members.</p>]]></description>
            <pubDate>Mon, 01 Jan 2025 10:00:00 GMT</pubDate>
            <category>news</category>
          </item>
        </channel>
      </rss>
    `);

    expect(db.boostyPost.findUnique).toHaveBeenCalled();
    expect(telegram.publishPostToChannel).toHaveBeenCalledWith(
      premiumChannel.chatId,
      {
        title: "[premium] Launch",
        excerpt: "<p>Big update for premium members.</p>",
        sourceLink: "https://boosty.example/posts/1"
      }
    );
    expect(db.boostyPost.create).toHaveBeenCalled();
  });

  it("ignores already reposted items", async () => {
    const db = createDb({
      id: "existing",
      externalId: "post-1",
      title: "[basic] Existing",
      url: "https://boosty.example/posts/1",
      publishedAt: new Date("2025-01-01T10:00:00.000Z"),
      tier: SubscriptionTier.basic,
      rawPayload: {},
      telegramMessageId: BigInt(10),
      createdAt: new Date("2025-01-01T10:05:00.000Z")
    });
    const telegram = {
      publishPostToChannel: vi.fn(async () => 42)
    };

    const service = new BoostyRepostingService(baseConfig, {
      db,
      telegram,
      logger: {
        info: vi.fn(),
        error: vi.fn()
      }
    });

    await service.processFeed(`
      <rss>
        <channel>
          <item>
            <guid>post-1</guid>
            <title>[basic] Existing</title>
            <link>https://boosty.example/posts/1</link>
            <description>Already posted</description>
            <pubDate>Mon, 01 Jan 2025 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `);

    expect(telegram.publishPostToChannel).not.toHaveBeenCalled();
    expect(db.boostyPost.create).not.toHaveBeenCalled();
  });

  it("does not persist a BoostyPost when Telegram publishing fails", async () => {
    const db = createDb();
    const telegram = {
      publishPostToChannel: vi.fn(async () => {
        throw new Error("telegram failed");
      })
    };

    const service = new BoostyRepostingService(baseConfig, {
      db,
      telegram,
      logger: {
        info: vi.fn(),
        error: vi.fn()
      }
    });

    await expect(
      service.processFeed(`
        <rss>
          <channel>
            <item>
              <guid>post-2</guid>
              <title>[basic] New</title>
              <link>https://boosty.example/posts/2</link>
              <description>Will fail</description>
              <pubDate>Mon, 01 Jan 2025 10:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>
      `)
    ).rejects.toThrow("telegram failed");

    expect(db.boostyPost.create).not.toHaveBeenCalled();
  });
});
