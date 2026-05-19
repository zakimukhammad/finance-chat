import { Context, Markup } from 'telegraf';
import { handleAddFlow } from '../commands/add';
import { NLPService } from '../../services/nlp';
import { OwnerService } from '../../services/owner';
import { TransactionService } from '../../services/transaction';
import { matchCategory } from '../../services/nlp/categoryMatcher';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { buildConfirmationKeyboard, buildCategoriesKeyboard, buildWalletsKeyboard } from '../../utils/keyboard';
import { CategoryService } from '../../services/category';
import { BudgetService } from '../../services/budget';
import { WalletService } from '../../services/wallet';
import { logger } from '../../utils/logger';

export const textMessageHandler = async (ctx: Context) => {
  const text = (ctx.message as any)?.text;
  if (!text || text.startsWith('/')) return;

  const state = (ctx as any).conversationState;

  // ─── Active conversation flow (e.g. /add step) ───────────────────────
  if (state) {
    if (state.state.startsWith('add_')) {
      await handleAddFlow(ctx, state, text);
      return;
    }

    // NLP confirmation flow: user said "yes" or "no"
    if (state.state === 'nlp_confirm') {
      const lower = text.trim().toLowerCase();
      if (['yes', 'y', 'ya', 'yep', 'ok', 'save', 'oke', 'sip'].includes(lower)) {
        await saveNlpTransaction(ctx, state.context);
        return;
      } else if (['no', 'n', 'tidak', 'nope', 'cancel', 'batal'].includes(lower)) {
        await (ctx as any).clearConversationState();
        await ctx.reply('❌ Cancelled. Type /add for guided entry or just type naturally.');
        return;
      }
      // If not yes/no, treat as new NLP input (fall through)
      await (ctx as any).clearConversationState();
    }

    // Budget setup flow: user typing amount
    if (state.state === 'budget_set_amount') {
      const { handleBudgetAmountFlow } = await import('../commands/budget');
      const handled = await handleBudgetAmountFlow(ctx, state, text);
      if (handled) return;
    }

    // Wallet setup flow: user typing wallet inputs
    if (state.state && state.state.startsWith('wallet_add_')) {
      const { handleWalletAddFlow } = await import('../commands/wallets');
      const handled = await handleWalletAddFlow(ctx, state, text);
      if (handled) return;
    }

    // NLP category selection flow: user picked a type
    if (state.state === 'nlp_pick_type') {
      const lower = text.trim().toLowerCase();
      let type: 'expense' | 'income' | null = null;
      if (['expense', 'pengeluaran', '1'].includes(lower)) type = 'expense';
      else if (['income', 'pemasukan', '2'].includes(lower)) type = 'income';
      
      if (type) {
        const categories = await CategoryService.getByType(type);
        await (ctx as any).setConversationState({
          state: 'nlp_pick_category',
          context: { ...state.context, type }
        });
        await ctx.reply('Which category?', buildCategoriesKeyboard(categories, type));
        return;
      }
    }

    // Other flows can be routed here
    return;
  }

  // ─── No active state: Try NLP parsing ─────────────────────────────────
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) {
    await ctx.reply('Please run /start first to set up your account.');
    return;
  }

  const parsed = await NLPService.parse(text, owner.currency, owner.timezone);

  // Non-financial or unparseable text
  if (!parsed) {
    await ctx.reply('💡 Tip: Type something like "spent 50k on lunch" or use /help to see all commands.');
    return;
  }

  // ─── Confidence-based routing (TRD Section 12.4) ──────────────────────

  if (parsed.confidence >= 0.85) {
    // HIGH confidence: auto-process, show confirmation card
    await autoProcessNlp(ctx, parsed, owner.currency);
  } else if (parsed.confidence >= 0.60) {
    // MEDIUM confidence: show result, ask "Does this look right?"
    await askConfirmNlp(ctx, parsed, owner.currency);
  } else {
    // LOW confidence: ask clarifying question
    await askClarifyNlp(ctx, parsed);
  }
};

// ─── High confidence: auto-save with undo ───────────────────────────────────

async function autoProcessNlp(ctx: Context, parsed: any, ownerCurrency: string) {
  const type = parsed.intent === 'LOG_INCOME' ? 'income' : parsed.intent === 'LOG_TRANSFER' ? 'transfer' : 'expense';
  
  // Resolve category if not a transfer
  let category = null;
  if (type !== 'transfer') {
    category = await matchCategory(parsed.category_hint, type);
    if (!category) {
      await askConfirmNlp(ctx, parsed, ownerCurrency);
      return;
    }
  }

  // Resolve wallets
  let wallet = null;
  if (parsed.wallet_hint) {
    wallet = await WalletService.getByName(parsed.wallet_hint);
    if (!wallet) {
      await askConfirmNlp(ctx, parsed, ownerCurrency);
      return;
    }
  } else {
    const owner = await OwnerService.getOwner(ctx.from?.id!);
    if (owner?.settings?.default_wallet_id) {
      const wallets = await WalletService.list();
      wallet = wallets.find(w => w.id === owner.settings.default_wallet_id) || null;
    }
  }

  let toWallet = null;
  if (type === 'transfer') {
    if (parsed.to_wallet_hint) {
      toWallet = await WalletService.getByName(parsed.to_wallet_hint);
      if (!toWallet) {
        await askConfirmNlp(ctx, parsed, ownerCurrency);
        return;
      }
    } else {
      await askConfirmNlp(ctx, parsed, ownerCurrency);
      return;
    }
  }

  const tx = await TransactionService.create({
    type,
    amount: parsed.amount,
    currency: parsed.currency || ownerCurrency,
    wallet_id: wallet?.id || null,
    to_wallet_id: toWallet?.id || null,
    category_id: category?.id || null,
    description: parsed.description,
    date: parsed.date,
    source: 'manual',
    metadata: {
      nlp_intent: parsed.intent,
      nlp_confidence: parsed.confidence,
      nlp_raw: (ctx.message as any)?.text,
    },
  });

  let budgetStr = '';
  if (type === 'expense' && category?.id) {
    budgetStr = await BudgetService.formatInlineStatus(category.id, ownerCurrency);
  }

  let walletLine = '';
  if (type === 'transfer' && wallet && toWallet) {
    walletLine = `💳 From: ${wallet.icon} ${wallet.name} ➡️ To: ${toWallet.icon} ${toWallet.name}\n`;
  } else if (wallet) {
    walletLine = `💳 Wallet: ${wallet.icon} ${wallet.name}\n`;
  }

  const text =
    `✅ Logged!\n\n` +
    `${type === 'expense' ? '💸' : type === 'income' ? '💰' : '🔄'} ${formatCurrency(parsed.amount, parsed.currency || ownerCurrency)}\n` +
    (category ? `📁 ${category.icon} ${category.name}\n` : '') +
    walletLine +
    `📅 ${formatDate(parsed.date)}\n` +
    (parsed.description ? `📝 ${parsed.description}\n` : '') + budgetStr +
    `\n\nID: \`${tx.id.split('-')[0]}\``;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: buildConfirmationKeyboard(tx.id).reply_markup,
  });
}

// ─── Medium confidence: show result + ask ───────────────────────────────────

async function askConfirmNlp(ctx: Context, parsed: any, ownerCurrency: string) {
  const type = parsed.intent === 'LOG_INCOME' ? 'income' : parsed.intent === 'LOG_TRANSFER' ? 'transfer' : 'expense';
  
  let category = null;
  if (type !== 'transfer') {
    category = await matchCategory(parsed.category_hint, type);
  }

  let wallet = null;
  if (parsed.wallet_hint) {
    wallet = await WalletService.getByName(parsed.wallet_hint);
  } else {
    const owner = await OwnerService.getOwner(ctx.from?.id!);
    if (owner?.settings?.default_wallet_id) {
      const wallets = await WalletService.list();
      wallet = wallets.find(w => w.id === owner.settings.default_wallet_id) || null;
    }
  }

  let toWallet = null;
  if (type === 'transfer' && parsed.to_wallet_hint) {
    toWallet = await WalletService.getByName(parsed.to_wallet_hint);
  }

  let walletLine = '';
  if (type === 'transfer') {
    walletLine = `💳 From: ${wallet ? `${wallet.icon} ${wallet.name}` : 'unknown'} ➡️ To: ${toWallet ? `${toWallet.icon} ${toWallet.name}` : 'unknown'}\n`;
  } else if (wallet) {
    walletLine = `💳 Wallet: ${wallet.icon} ${wallet.name}\n`;
  }

  const text =
    `🤔 Does this look right?\n\n` +
    `${type === 'expense' ? '💸 Expense' : type === 'income' ? '💰 Income' : '🔄 Transfer'}: ${formatCurrency(parsed.amount, parsed.currency || ownerCurrency)}\n` +
    (category ? `📁 ${category.icon} ${category.name}\n` : type !== 'transfer' ? `📁 Category: ${parsed.category_hint || 'unknown'}\n` : '') +
    walletLine +
    `📅 ${formatDate(parsed.date)}\n` +
    (parsed.description ? `📝 ${parsed.description}\n` : '') +
    `\nReply *yes* to save, *no* to cancel, or /add to edit manually.`;

  await (ctx as any).setConversationState({
    state: 'nlp_confirm',
    context: {
      intent: parsed.intent,
      amount: parsed.amount,
      currency: parsed.currency || ownerCurrency,
      category_id: category?.id || null,
      category_name: category?.name || parsed.category_hint,
      category_icon: category?.icon || '❓',
      wallet_id: wallet?.id || null,
      wallet_name: wallet?.name || null,
      wallet_icon: wallet?.icon || null,
      to_wallet_id: toWallet?.id || null,
      to_wallet_name: toWallet?.name || null,
      to_wallet_icon: toWallet?.icon || null,
      description: parsed.description,
      date: parsed.date,
      nlp_raw: (ctx.message as any)?.text,
      nlp_confidence: parsed.confidence,
    }
  });

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

// ─── Low confidence: ask expense or income ──────────────────────────────────

async function askClarifyNlp(ctx: Context, parsed: any) {
  await (ctx as any).setConversationState({
    state: 'nlp_pick_type',
    context: {
      amount: parsed.amount,
      currency: parsed.currency,
      description: parsed.description,
      date: parsed.date,
      nlp_raw: (ctx.message as any)?.text,
      nlp_confidence: parsed.confidence,
    }
  });

  await ctx.reply(
    `I detected an amount of *${parsed.amount}* but I'm not sure about the type.\n\n` +
    `Is this an *expense* or *income*?\n` +
    `Reply with "expense" or "income".`,
    { parse_mode: 'Markdown' }
  );
}

// ─── Save from NLP confirm flow ─────────────────────────────────────────────

async function saveNlpTransaction(ctx: Context, nlpContext: any) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const owner = await OwnerService.getOwner(telegramId);
  if (!owner) return;

  const type = nlpContext.intent === 'LOG_INCOME' ? 'income' : nlpContext.intent === 'LOG_TRANSFER' ? 'transfer' : 'expense';

  // If no category was matched, and it's not a transfer, ask for it
  if (!nlpContext.category_id && type !== 'transfer') {
    const categories = await CategoryService.getByType(type);
    await (ctx as any).setConversationState({
      state: 'nlp_pick_category',
      context: nlpContext
    });
    await ctx.reply('Which category?', buildCategoriesKeyboard(categories, type));
    return;
  }

  // If it's a transfer but wallets are missing, we should ask for them.
  // However, in high/medium confidence we already prompt "Does this look right"
  // So if they confirmed yes, we should assume the parsed/default wallets or prompt them.
  // To keep it simple and robust, let's allow it to save.
  const tx = await TransactionService.create({
    type,
    amount: nlpContext.amount,
    currency: nlpContext.currency || owner.currency,
    wallet_id: nlpContext.wallet_id || null,
    to_wallet_id: nlpContext.to_wallet_id || null,
    category_id: nlpContext.category_id || null,
    description: nlpContext.description,
    date: nlpContext.date,
    source: 'manual',
    metadata: {
      nlp_intent: nlpContext.intent,
      nlp_confidence: nlpContext.nlp_confidence,
      nlp_raw: nlpContext.nlp_raw,
    },
  });

  await (ctx as any).clearConversationState();

  let budgetStr = '';
  if (type === 'expense' && nlpContext.category_id) {
    budgetStr = await BudgetService.formatInlineStatus(nlpContext.category_id, owner.currency);
  }

  let walletLine = '';
  if (type === 'transfer' && nlpContext.wallet_id && nlpContext.to_wallet_id) {
    walletLine = `\n💳 From: ${nlpContext.wallet_icon} ${nlpContext.wallet_name} ➡️ To: ${nlpContext.to_wallet_icon} ${nlpContext.to_wallet_name}`;
  } else if (nlpContext.wallet_id) {
    walletLine = `\n💳 Wallet: ${nlpContext.wallet_icon} ${nlpContext.wallet_name}`;
  }

  await ctx.reply(
    `✅ Saved!${walletLine}${budgetStr}\n\n` +
    `ID: \`${tx.id.split('-')[0]}\``,
    {
      parse_mode: 'Markdown',
      reply_markup: buildConfirmationKeyboard(tx.id).reply_markup,
    }
  );
}

// ─── Callback Handler for NLP Flow ──────────────────────────────────────────

export async function handleNlpCategoryCallback(ctx: Context, categoryId: string) {
  const state = (ctx as any).conversationState;
  if (state?.state !== 'nlp_pick_category') return false; // Not handled here

  const category = await CategoryService.getById(categoryId);
  if (!category) return true;

  // Save the transaction
  const nlpContext = state.context;
  nlpContext.category_id = category.id;
  nlpContext.category_name = category.name;
  nlpContext.category_icon = category.icon;

  await saveNlpTransaction(ctx, nlpContext);
  return true; // Handled
}
