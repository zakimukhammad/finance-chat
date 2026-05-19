import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedTransaction } from '../../types';
import { logger } from '../../utils/logger';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (genAI) return genAI;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  genAI = new GoogleGenerativeAI(key);
  return genAI;
}

/**
 * Build the Gemini system prompt from TRD Section 12.2.
 */
function buildSystemPrompt(ownerCurrency: string, ownerTimezone: string): string {
  return `You are a financial transaction parser for a personal finance bot.
Extract transaction details from the user's message and return ONLY valid JSON.
Return null if the message is not a financial transaction.

Response schema (return exactly this shape or null):
{
    "intent": "LOG_EXPENSE" | "LOG_INCOME" | "LOG_TRANSFER",
    "amount": number,
    "currency": string,       // ISO 4217 code, infer from symbol or context
    "category_hint": string | null,
    "wallet_hint": string | null,
    "to_wallet_hint": string | null,
    "description": string | null,
    "date": string,           // ISO date YYYY-MM-DD, resolve relative dates using today's date
    "confidence": number      // 0.0 to 1.0
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
 * Call Gemini Flash to parse a transaction from text.
 */
export async function callGemini(
  text: string,
  ownerCurrency: string,
  ownerTimezone: string
): Promise<ParsedTransaction | null> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const systemPrompt = buildSystemPrompt(ownerCurrency, ownerTimezone);

  const result = await model.generateContent({
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser message: "${text}"` }] },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 256,
    },
  });

  const response = result.response;
  const responseText = response.text().trim();

  logger.debug({ responseText }, 'Gemini raw response');

  // Handle "null" response (non-financial text)
  if (responseText === 'null' || responseText === '') {
    return null;
  }

  // Parse JSON response (strip markdown code fences if present)
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as ParsedTransaction;

    // Validate required fields
    if (!parsed.intent || !parsed.amount || parsed.amount <= 0) {
      logger.warn({ parsed }, 'Gemini returned invalid parsed result');
      return null;
    }

    // Ensure defaults
    parsed.currency = parsed.currency || ownerCurrency;
    parsed.date = parsed.date || new Date().toISOString().split('T')[0];
    parsed.confidence = parsed.confidence || 0.7;

    return parsed;
  } catch (err) {
    logger.warn({ err, responseText: cleaned }, 'Gemini response is not valid JSON');
    return null;
  }
}
