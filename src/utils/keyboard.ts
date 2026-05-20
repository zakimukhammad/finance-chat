import { Markup } from 'telegraf';

// ─── Reusable Keyboards ───────────────────────────────────────────────────

export const buildCurrencyKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🇺🇸 USD', 'currency_USD'),
      Markup.button.callback('🇪🇺 EUR', 'currency_EUR'),
      Markup.button.callback('🇬🇧 GBP', 'currency_GBP'),
      Markup.button.callback('🇮🇩 IDR', 'currency_IDR'),
    ],
    [
      Markup.button.callback('🇸🇬 SGD', 'currency_SGD'),
      Markup.button.callback('🇲🇾 MYR', 'currency_MYR'),
      Markup.button.callback('🇯🇵 JPY', 'currency_JPY'),
      Markup.button.callback('✏️ Other', 'currency_OTHER'),
    ]
  ]);
};

export const buildTimezoneKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Asia/Jakarta', 'tz_Asia/Jakarta'),
      Markup.button.callback('Asia/Singapore', 'tz_Asia/Singapore'),
      Markup.button.callback('UTC', 'tz_UTC')
    ],
    [
      Markup.button.callback('US/Eastern', 'tz_US/Eastern'),
      Markup.button.callback('Europe/London', 'tz_Europe/London'),
      Markup.button.callback('✏️ Other', 'tz_OTHER')
    ]
  ]);
};

export const buildDateKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Today', 'date_today'),
      Markup.button.callback('⬅️ Yesterday', 'date_yesterday'),
    ]
  ]);
};

export const buildConfirmationKeyboard = (txId?: string) => {
  if (txId) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('↩️ Undo', `undo_${txId}`)
      ]
    ]);
  }
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Save', 'confirm_save'),
      Markup.button.callback('✏️ Edit', 'confirm_edit'),
      Markup.button.callback('🗑️ Cancel', 'confirm_cancel'),
    ]
  ]);
};

export const buildCategoriesKeyboard = (categories: any[], type: string) => {
  // chunks of 2 or 3 buttons
  const buttons = categories.map(cat => Markup.button.callback(`${cat.icon} ${cat.name}`, `cat_${cat.id}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return Markup.inlineKeyboard(rows);
};

export const buildWalletsKeyboard = (wallets: any[], defaultWalletId?: string | null) => {
  const rows = [];
  for (let i = 0; i < wallets.length; i += 2) {
    const chunk = wallets.slice(i, i + 2).map(w => {
      const isDefault = w.id === defaultWalletId || w.is_default;
      const label = `${w.icon} ${w.name}${isDefault ? ' (Default)' : ''}`;
      return Markup.button.callback(label, `wallet_${w.id}`);
    });
    rows.push(chunk);
  }
  rows.push([Markup.button.callback('⏭️ Skip (No Wallet)', 'wallet_skip')]);
  return Markup.inlineKeyboard(rows);
};
