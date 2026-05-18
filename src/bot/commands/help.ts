import { Context } from 'telegraf';

export const helpHandler = async (ctx: Context) => {
  const helpText = `📖 *Available Commands*

\`<free text>\`           - Log via NLP (e.g. spent 50 on lunch)
\`/add expense\`        - Guided expense entry
\`/add income\`         - Guided income entry
\`/history\`            - Show last 10 transactions
\`/history <N>\`        - Show last N transactions (max 50)
\`/delete last\`        - Delete most recent transaction
\`/delete <id>\`        - Delete transaction by short ID
\`/edit last\`          - Edit most recent transaction
\`/summary\`            - Current month summary
\`/summary week\`       - Current week summary
\`/summary today\`      - Today's transactions
\`/summary <YYYY-MM>\`  - Summary for specific month
\`/budget set <cat> <amt>\` - Set monthly budget
\`/budget status\`      - View budgets usage
\`/goal list\`          - List savings goals
\`/recurring list\`     - List recurring entries
\`/export csv\`         - Export transactions as CSV
\`/export pdf\`         - Export current month as PDF
\`/insights\`           - AI-generated spending analysis
\`/categories\`         - Manage categories
\`/currency <code>\`    - Change base display currency
\`/settings\`           - View and edit preferences

_Need more help? Just ask naturally!_`;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
};
