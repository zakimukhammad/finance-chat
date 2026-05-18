import { ParsedTransaction } from '../types';
import { tryRegexFastPath } from './nlp/regexParser';
import { callGemini } from './nlp/geminiParser';
import { callGroq } from './nlp/groqParser';
import { logger } from '../utils/logger';

/**
 * NLPService: Two-path transaction parser.
 * 
 * 1. Try regex fast-path (zero cost, zero latency)
 * 2. Try Gemini Flash (primary AI)
 * 3. Fallback to Groq (transparent to user)
 * 4. Return null if everything fails
 */
export class NLPService {
  static async parse(
    text: string,
    ownerCurrency: string = 'IDR',
    ownerTimezone: string = 'Asia/Jakarta'
  ): Promise<ParsedTransaction | null> {
    // Skip obvious non-financial messages
    if (isNonFinancial(text)) {
      logger.debug({ text }, 'NLP: Non-financial text, skipping');
      return null;
    }

    // 1. Try regex fast-path (zero cost, zero latency)
    const fastResult = tryRegexFastPath(text, ownerCurrency);
    if (fastResult && fastResult.confidence >= 0.85) {
      logger.info({ text, result: fastResult }, 'NLP: Regex fast-path matched');
      return fastResult;
    }

    // 2. Try Gemini Flash
    try {
      const geminiResult = await callGemini(text, ownerCurrency, ownerTimezone);
      if (geminiResult) {
        logger.info({ text, result: geminiResult }, 'NLP: Gemini parsed successfully');
        return geminiResult;
      }
    } catch (err) {
      logger.warn({ err, text }, 'NLP: Gemini failed, falling back to Groq');
    }

    // 3. Fallback to Groq
    try {
      const groqResult = await callGroq(text, ownerCurrency, ownerTimezone);
      if (groqResult) {
        logger.info({ text, result: groqResult }, 'NLP: Groq fallback parsed successfully');
        return groqResult;
      }
    } catch (err) {
      logger.error({ err, text }, 'NLP: Both Gemini and Groq failed');
    }

    // 4. If regex had a low-confidence result, return it anyway
    if (fastResult) {
      logger.info({ text, result: fastResult }, 'NLP: Returning low-confidence regex result');
      return fastResult;
    }

    return null;
  }
}

/**
 * Quick filter for obviously non-financial text.
 * Returns true if the text is very likely NOT a transaction.
 */
function isNonFinancial(text: string): boolean {
  const trimmed = text.trim().toLowerCase();

  // Single-word greetings or common non-financial phrases
  const nonFinancialPatterns = [
    /^(hi|hello|hey|halo|hola|yo|sup)$/i,
    /^(thanks|thank you|terima kasih|makasih|thx|ty)$/i,
    /^(ok|okay|oke|sip|good|great|nice|cool|awesome)$/i,
    /^(yes|no|ya|tidak|gak|nggak|yep|nope)$/i,
    /^(bye|goodbye|selamat tinggal|dadah)$/i,
    /^(what|how|when|where|why|who|apa|siapa|kapan|dimana|kenapa|bagaimana)\b/i,
  ];

  for (const pattern of nonFinancialPatterns) {
    if (pattern.test(trimmed)) return true;
  }

  // Must contain at least one digit to be a potential transaction
  if (!/\d/.test(trimmed)) return true;

  return false;
}
