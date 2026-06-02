import { Context } from 'telegraf';

export const helpHandler = async (ctx: Context) => {
  const helpText = `📖 *Finance Chatbot — Available Commands*

*NLP / Natural Language*
• \`<free text>\` - Log naturally (e.g. _"kopi 15000 tadi malam"_, _"spent 50 on lunch yesterday"_)

*Guided Logging*
• \`/add expense\` - Guided expense entry
• \`/add income\` - Guided income entry
• \`/add transfer\` - Guided wallet transfer

*Transaction History & Modification*
• \`/history\` - Show last 10 transactions
• \`/history <N>\` - Show last N transactions (max 50)
• \`/delete last\` - Delete most recent transaction
• \`/delete <id>\` - Delete transaction by short ID or full UUID
• \`/edit last\` - Edit most recent transaction

*Monthly Summaries & Export*
• \`/summary\` - Current month summary (includes Net Worth)
• \`/summary week\` - Current week summary
• \`/summary today\` - Today's transactions
• \`/summary <YYYY-MM>\` - Summary for a specific month
• \`/export csv\` - Export transactions as CSV
• \`/export pdf\` - Export current month report as PDF
• \`/insights\` - AI-generated spending analysis and insights

*Budget Management*
• \`/budget set <category> <amount>\` - Set monthly budget for a category
• \`/budget status\` - View budgets status and remaining balance

*Wallets & Reconciliation*
• \`/wallet\` - List wallets and enter interactive wallet creation
• \`/wallet balance\` / \`/wallets\` - View all wallet balances and Net Worth
• \`/wallet delete <name>\` - Delete a wallet (if it has no transactions)
• \`/wallet rename <old> <new>\` - Rename a wallet
• \`/reconcile\` - Interactive wallet balance checkup & reconciliation
• \`/reconcile <name> <amount>\` - Direct wallet reconciliation (creates adjusting income/expense)

*Savings Goals*
• \`/goal list\` - List all savings goals and progress
• \`/goal set <name> <target> [YYYY-MM-DD]\` - Create/set a savings goal
• \`/goal add <name> <amount>\` - Contribute funds to a goal
• \`/goal delete <name>\` - Delete a savings goal

*Recurring Transactions*
• \`/recurring list\` - List all recurring configurations
• \`/recurring add\` - Add a new recurring transaction (guided)
• \`/recurring delete <id>\` - Delete a recurring transaction by ID

*Categories*
• \`/categories\` - List categories & delete custom ones
• \`/categories add <name> <icon> [type]\` - Add custom category (type: _expense_ | _income_ | _both_)

*Preferences & Settings*
• \`/currency <code>\` - Change base display currency (e.g. \`USD\`, \`IDR\`, \`EUR\`)
• \`/settings\` - View and edit settings (daily/weekly digest toggles, timezone, default wallet, etc.)

_Need more help? Just chat with me naturally!_`;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
};
