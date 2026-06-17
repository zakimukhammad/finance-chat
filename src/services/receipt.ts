import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedTransaction } from '../types';
import { logger } from '../utils/logger';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (genAI) return genAI;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  genAI = new GoogleGenerativeAI(key);
  return genAI;
}

export class ReceiptService {
  /**
   * Parse a receipt image buffer using Gemini Flash Vision.
   */
  static async parseReceipt(
    imageBuffer: Buffer,
    mimeType: string,
    ownerCurrency: string,
    ownerTimezone: string
  ): Promise<ParsedTransaction | null> {
    logger.info('Calling Gemini Flash Vision for receipt parsing');

    try {
      const client = getClient();
      const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const prompt = `You are a receipt parsing assistant for a personal finance bot.
Analyze this receipt image and extract the transaction details. Return ONLY valid JSON matching the schema below.
Return null if you cannot read any transaction details or if the image is not a receipt.

Response schema:
{
    "intent": "LOG_EXPENSE" | "LOG_INCOME", // usually LOG_EXPENSE for receipts
    "amount": number,                        // total amount on the receipt
    "currency": string,                      // ISO 4217 currency code (e.g. IDR, USD, EUR, etc.)
    "category_hint": string | null,          // a short hint for category (e.g. Food, Groceries, Transport, Shopping)
    "description": string | null,            // merchant/store name (e.g. McDonald's, Starbucks, Carrefour)
    "date": string,                          // transaction date in YYYY-MM-DD format (infer from receipt, or use today's date if not found)
    "confidence": number                     // confidence score between 0.0 and 1.0 (e.g. 0.95)
}

Today's date: ${new Date().toISOString().split('T')[0]}
Owner's currency: ${ownerCurrency}
Owner's timezone: ${ownerTimezone}

Rules:
1. Identify the merchant/store name and use it as the "description".
2. Find the TOTAL amount paid (after tax and discounts).
3. Extract the date of the transaction. If you cannot find the year or date, assume the current year and/or fallback to today's date.
4. If the currency symbol or text is present on the receipt (e.g. Rp, $, EUR, SGD), convert to ISO code. If no currency is visible, default to the owner's currency: ${ownerCurrency}.
5. Return ONLY the JSON object. No explanation, no markdown code block fences (do NOT include \`\`\`json).`;

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBuffer.toString('base64'),
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
        },
      });

      const responseText = result.response.text().trim();
      logger.debug({ responseText }, 'Gemini Vision raw response');

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

        if (!parsed.intent || !parsed.amount || parsed.amount <= 0) {
          logger.warn({ parsed }, 'Gemini Vision returned invalid parsed result');
          return null;
        }

        // Ensure defaults
        parsed.currency = parsed.currency || ownerCurrency;
        parsed.date = parsed.date || new Date().toISOString().split('T')[0];
        parsed.confidence = parsed.confidence || 0.7;

        return parsed;
      } catch (err) {
        logger.warn({ err, responseText: cleaned }, 'Gemini Vision response is not valid JSON');
        return null;
      }
    } catch (err) {
      logger.error({ err }, 'Gemini Vision receipt parsing failed');
      return null;
    }
  }
}
