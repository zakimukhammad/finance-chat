import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { TransactionService } from './transaction';
import { BudgetService } from './budget';
import { GoalService } from './goal';
import { OwnerService } from './owner';
import { CategoryService } from './category';
import { logger } from '../utils/logger';
import { subMonths, format, startOfMonth, endOfMonth, subDays } from 'date-fns';

let genAI: GoogleGenerativeAI | null = null;
let groqClient: Groq | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (genAI) return genAI;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  genAI = new GoogleGenerativeAI(key);
  return genAI;
}

function getGroqClient(): Groq {
  if (groqClient) return groqClient;
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('Missing GROQ_API_KEY');
  groqClient = new Groq({ apiKey: key });
  return groqClient;
}

const INSIGHT_PROMPT = (data: any) => `
You are a friendly personal finance coach. Analyse the spending data below and
return 3-5 specific, actionable insights. Be conversational, not generic.
Use emojis. Keep each insight to 2-3 sentences.
Ensure the entire response is under 600 characters in total (including spaces and emojis).
Do not wrap in JSON, markdown code fences, or write title/headers. Just return the direct coach insights.

Focus on:
- Unusual spending spikes vs last month
- Budget categories at risk
- Positive trends worth celebrating
- Goal progress projections
- Subscription audit opportunities

Data:
${JSON.stringify(data, null, 2)}
`;

export class InsightService {
  /**
   * Generate financial insights for a given yearMonth (YYYY-MM format) or defaults to current month.
   */
  static async generate(yearMonth?: string): Promise<string> {
    const ownerIdStr = process.env.OWNER_TELEGRAM_ID;
    if (!ownerIdStr) {
      throw new Error('Missing OWNER_TELEGRAM_ID environment variable');
    }
    const telegramId = parseInt(ownerIdStr, 10);
    const owner = await OwnerService.getOwner(telegramId);
    if (!owner) {
      throw new Error('Owner not onboarding yet');
    }

    const ownerCurrency = owner.currency || 'USD';

    // ─── Determine date ranges ────────────────────────────────────────────
    let now = new Date();
    if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const [year, month] = yearMonth.split('-').map(Number);
      // set to last day of that month to capture full history
      now = endOfMonth(new Date(year, month - 1, 1));
    }

    const currentPeriodStr = format(now, 'yyyy-MM');

    // 30 days window from "now"
    const toDateStr = format(now, 'yyyy-MM-dd');
    const fromDateStr = format(subDays(now, 30), 'yyyy-MM-dd');

    // Prior month summary
    const priorMonthDate = subMonths(now, 1);

    // ─── Fetch context data ───────────────────────────────────────────────
    logger.info({ currentPeriodStr, fromDateStr, toDateStr }, 'Fetching data for AI insights');

    const [txs, budgetStatuses, savingsGoals, priorSummary, allCategories] = await Promise.all([
      TransactionService.getByDateRange(fromDateStr, toDateStr),
      BudgetService.getStatus(),
      GoalService.list(),
      TransactionService.getSummary('month', priorMonthDate.toISOString()),
      CategoryService.getAll(),
    ]);

    // Build a lookup map: category UUID → human-readable name
    const categoryNameMap: Record<string, string> = {};
    for (const cat of allCategories) {
      categoryNameMap[cat.id] = `${cat.icon} ${cat.name}`;
    }

    // ─── Build serialized payload (no PII, only categories, dates, amounts) ──
    const serializedTxs = txs.map(tx => ({
      date: tx.date,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      amount_base: Number(tx.amount_base),
      // Use human-readable name so the AI never echoes raw UUIDs or field names with underscores
      category: tx.category_id ? (categoryNameMap[tx.category_id] ?? 'Unknown') : 'Uncategorized',
    }));

    const serializedBudgets = budgetStatuses.map(b => ({
      category_name: b.category_name,
      budget_amount: Number(b.budget_amount),
      spent: Number(b.spent),
      pct_used: Number(b.pct_used),
    }));

    const serializedGoals = savingsGoals.map(g => ({
      name: g.name,
      target_amount: Number(g.target_amount),
      current_amount: Number(g.current_amount),
      deadline: g.deadline,
      status: g.status,
    }));

    const contextPayload = {
      owner_currency: ownerCurrency,
      current_period: currentPeriodStr,
      last_30_days_spending: {
        total_expense: serializedTxs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount_base, 0),
        total_income: serializedTxs.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount_base, 0),
        transactions: serializedTxs,
      },
      budgets: serializedBudgets,
      goals: serializedGoals,
      prior_month_summary: {
        period: priorSummary.period,
        total_income: priorSummary.total_income,
        total_expense: priorSummary.total_expense,
        net: priorSummary.net,
      },
    };

    const promptText = INSIGHT_PROMPT(contextPayload);

    // ─── Try Gemini Flash First ───────────────────────────────────────────
    try {
      logger.info('Calling Gemini for spending insights');
      const client = getGeminiClient();
      const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 600,
        },
      });

      const responseText = result.response.text().trim();
      if (responseText) {
        logger.info('Gemini spending insights generated successfully');
        return this.cleanResponse(responseText);
      }
      throw new Error('Gemini returned an empty response');
    } catch (geminiError) {
      logger.warn({ geminiError }, 'Gemini spending insights failed. Falling back to Groq');

      // ─── Fallback to Groq ───────────────────────────────────────────────
      try {
        const groq = getGroqClient();
        const chatCompletion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'You are a personal finance coach offering brief spending insights.',
            },
            {
              role: 'user',
              content: promptText,
            },
          ],
          temperature: 0.5,
          max_tokens: 600,
        });

        const responseText = chatCompletion.choices[0]?.message?.content?.trim() || '';
        if (responseText) {
          logger.info('Groq spending insights fallback generated successfully');
          return this.cleanResponse(responseText);
        }
        throw new Error('Groq returned an empty response');
      } catch (groqError) {
        logger.error({ groqError }, 'Groq spending insights fallback also failed');
        throw new Error('Failed to generate insights via both AI services. Please try again later.');
      }
    }
  }

  /**
   * Utility to clean up markdown code fences, headers, etc.
   * Also escapes Telegram Markdown special characters that the AI might produce
   * and that would cause a parse error when sent with parse_mode: 'Markdown'.
   */
  private static cleanResponse(text: string): string {
    return text
      .replace(/^```(?:json)?\s*/i, '')  // strip opening code fence
      .replace(/\s*```$/i, '')           // strip closing code fence
      .trim()
      // Escape Telegram Markdown v1 special characters so the parser never fails
      .replace(/_/g, '\_')              // underscores → italic markers
      .replace(/\[/g, '\\[')            // square brackets → link openers
      .replace(/`/g, '\\`');            // backticks → inline-code markers
  }
}
