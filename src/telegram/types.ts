export type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string | undefined;
  username?: string | undefined;
  language_code?: string | undefined;
};

export type TelegramChat = {
  id: number;
  type: string;
};

export type TelegramSuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser | undefined;
  chat: TelegramChat;
  text?: string | undefined;
  successful_payment?: TelegramSuccessfulPayment | undefined;
};

export type TelegramPreCheckoutQuery = {
  id: string;
  from: TelegramUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage | undefined;
  pre_checkout_query?: TelegramPreCheckoutQuery | undefined;
};
