import Groq from 'groq-sdk';
import { ParsedTransaction } from '../../types';
import { logger } from '../../utils/logger';

let groqClient: Groq | null = null;

function getClient(): Groq {
  if (groqClient) return groqClient;
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('Missing GROQ_API_KEY');
  groqClient = new Groq({ apiKey: key });
  return groqClient;
}

/**
 * Build the Groq system prompt (same logic as Gemini, for consistent parsing).
 */
function buildSystemPrompt(ownerCurrency: string, ownerTimezone: string): string {
  return `You are a financial transaction parser for a personal finance bot.
Extract transaction details from the user's message and return ONLY valid JSON.
Return null if the message is not a financial transaction.

Response schema (return exactly this shape or null):
{
    "intent": "LOG_EXPENSE" | "LOG_INCOME" | "LOG_TRANSFER",
    "amount": number,
    "currency": string,
    "category_hint": string | null,
    "wallet_hint": string | null,
    "to_wallet_hint": string | null,
    "description": string | null,
    "date": string,
    "confidence": number
  }

Today's date: ${new Date().toISOString().split('T')[0]}
Owner's currency: ${ownerCurrency}
Owner's timezone: ${ownerTimezone}

Rules:
- "k" suffix means × 1000 (e.g. "50k" = 50000)
- Currency symbols: $ = USD, € = EUR, £ = GBP, Rp = IDR, RM = MYR
- If no currency detected, use owner's currency
- "yesterday" = today minus 1 day; "last Monday" = most recent Monday
- "kemarin" = yesterday (Indonesian)
- Set confidence < 0.80 if you are unsure of intent, amount, or date
- Return ONLY the JSON object, no markdown, no code fences, no explanation`;
}

/**
 * Call Groq (Llama 3.1 70B) as fallback parser.
 */
export async function callGroq(
  text: string,
  ownerCurrency: string,
  ownerTimezone: string
): Promise<ParsedTransaction | null> {
  const client = getClient();

  const systemPrompt = buildSystemPrompt(ownerCurrency, ownerTimezone);

  const chatCompletion = await client.chat.completions.create({
    model: 'llama-3.1-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature: 0.1,
    max_tokens: 256,
  });

  const responseText = chatCompletion.choices[0]?.message?.content?.trim() || '';

  logger.debug({ responseText }, 'Groq raw response');

  if (responseText === 'null' || responseText === '') {
    return null;
  }

  // Clean markdown code fences if present
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as ParsedTransaction;

    if (!parsed.intent || !parsed.amount || parsed.amount <= 0) {
      logger.warn({ parsed }, 'Groq returned invalid parsed result');
      return null;
    }

    parsed.currency = parsed.currency || ownerCurrency;
    parsed.date = parsed.date || new Date().toISOString().split('T')[0];
    parsed.confidence = parsed.confidence || 0.7;

    return parsed;
  } catch (err) {
    logger.warn({ err, responseText: cleaned }, 'Groq response is not valid JSON');
    return null;
  }
}
