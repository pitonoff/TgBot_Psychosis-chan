import type { AppConfig } from "../config.js";

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type CreateInviteLinkResponse = {
  invite_link: string;
  name?: string;
};

export class TelegramService {
  constructor(private readonly config: AppConfig) {}

  async sendMessage(chatId: number, text: string) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text
    });
  }

  async answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string) {
    return this.call("answerPreCheckoutQuery", {
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      error_message: errorMessage
    });
  }

  async createSingleUseInviteLink(memberUserId: number) {
    const expireDate = Math.floor(Date.now() / 1000) + this.config.TELEGRAM_INVITE_LINK_EXPIRE_HOURS * 60 * 60;

    return this.call<CreateInviteLinkResponse>("createChatInviteLink", {
      chat_id: String(this.config.TELEGRAM_CHANNEL_ID),
      creates_join_request: false,
      expire_date: expireDate,
      member_limit: 1,
      name: `paid-access-${memberUserId}-${Date.now()}`
    });
  }

  private async call<T = true>(method: string, body: Record<string, unknown>) {
    const response = await fetch(`https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Telegram API request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as TelegramApiResponse<T>;

    if (!payload.ok || payload.result === undefined) {
      throw new Error(payload.description ?? `Telegram API ${method} failed`);
    }

    return payload.result;
  }
}
