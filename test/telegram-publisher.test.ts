import { describe, expect, it, vi } from "vitest";

import { TelegramPublisher, splitTelegramHtmlMessage } from "../src/services/telegram-publisher.js";

describe("TelegramPublisher", () => {
  it("splits long messages into multiple chunks", () => {
    const text = `Title\n\n${"A".repeat(5000)}\n\nhttps://example.com`;
    const chunks = splitTelegramHtmlMessage(text, 4096);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 4096)).toBe(true);
  });

  it("falls back to text-only publishing when photo publishing fails", async () => {
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 99 })),
      sendPhoto: vi.fn(async () => {
        throw new Error("photo failed");
      })
    };
    const logger = {
      error: vi.fn()
    };

    const publisher = new TelegramPublisher(telegram, logger);

    const messageId = await publisher.publishPostToChannel(-1001, {
      title: "Hello",
      excerpt: "<p>World</p>",
      sourceLink: "https://example.com",
      imageUrl: "https://example.com/image.jpg"
    });

    expect(messageId).toBe(99);
    expect(telegram.sendPhoto).toHaveBeenCalledTimes(1);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });
});
