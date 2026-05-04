type PublishPostInput = {
  title: string;
  excerpt?: string;
  sourceLink: string;
  imageUrl?: string;
};

type TelegramPublisherGateway = {
  sendMessage(
    chatId: number | bigint,
    text: string,
    options?: {
      parse_mode?: "HTML";
      disable_web_page_preview?: boolean;
    }
  ): Promise<{ message_id: number }>;
  sendPhoto(
    chatId: number | bigint,
    photoUrl: string,
    options?: {
      caption?: string;
      parse_mode?: "HTML";
    }
  ): Promise<{ message_id: number }>;
};

type LoggerLike = {
  error(message: string): void;
};

const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;

export class TelegramPublisher {
  constructor(
    private readonly telegram: TelegramPublisherGateway,
    private readonly logger: LoggerLike = console
  ) {}

  async publishPostToChannel(channelChatId: number | bigint, post: PublishPostInput) {
    const fullText = this.formatPost(post);
    const chunks = splitTelegramHtmlMessage(fullText, TELEGRAM_MESSAGE_LIMIT);

    if (post.imageUrl) {
      try {
        const [caption, ...rest] = splitTelegramHtmlMessage(fullText, TELEGRAM_CAPTION_LIMIT);
        const photoMessage = await this.telegram.sendPhoto(channelChatId, post.imageUrl, {
          ...(caption ? { caption } : {}),
          parse_mode: "HTML"
        });

        for (const chunk of rest) {
          await this.telegram.sendMessage(channelChatId, chunk, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
        }

        return photoMessage.message_id;
      } catch (error) {
        this.logger.error(error instanceof Error ? `Telegram photo publish failed: ${error.message}` : "Telegram photo publish failed");
      }
    }

    try {
      const [firstChunk, ...rest] = chunks;
      if (!firstChunk) {
        throw new Error("Nothing to publish");
      }

      const firstMessage = await this.telegram.sendMessage(channelChatId, firstChunk, {
        parse_mode: "HTML",
        disable_web_page_preview: true
      });

      for (const chunk of rest) {
        await this.telegram.sendMessage(channelChatId, chunk, {
          parse_mode: "HTML",
          disable_web_page_preview: true
        });
      }

      return firstMessage.message_id;
    } catch (error) {
      this.logger.error(error instanceof Error ? `Telegram text publish failed: ${error.message}` : "Telegram text publish failed");
      throw error;
    }
  }

  formatPost(post: PublishPostInput) {
    const title = `<b>${escapeHtml(stripHtml(post.title))}</b>`;
    const excerpt = post.excerpt ? telegramSafeHtml(post.excerpt) : "";
    const sourceLink = `<a href="${escapeHtmlAttribute(post.sourceLink)}">Source link</a>`;

    return [title, excerpt, sourceLink].filter(Boolean).join("\n\n");
  }
}

export function splitTelegramHtmlMessage(text: string, limit: number) {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const cut = findSplitIndex(remaining, limit);
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function findSplitIndex(text: string, limit: number) {
  const slice = text.slice(0, limit);
  const separators = ["\n\n", "\n", " "];

  for (const separator of separators) {
    const index = slice.lastIndexOf(separator);
    if (index > 0) {
      return index + separator.length;
    }
  }

  return limit;
}

function telegramSafeHtml(value: string) {
  return stripUnsupportedHtml(value)
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p)>/gi, "")
    .trim();
}

function stripUnsupportedHtml(value: string) {
  return value
    .replace(/<(?!\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|br|p)\b)[^>]*>/gi, "")
    .replace(/<strong>/gi, "<b>")
    .replace(/<\/strong>/gi, "</b>")
    .replace(/<em>/gi, "<i>")
    .replace(/<\/em>/gi, "</i>")
    .replace(/<ins>/gi, "<u>")
    .replace(/<\/ins>/gi, "</u>")
    .replace(/<strike>/gi, "<s>")
    .replace(/<\/strike>/gi, "</s>")
    .replace(/<del>/gi, "<s>")
    .replace(/<\/del>/gi, "</s>");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
