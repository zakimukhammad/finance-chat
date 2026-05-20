export interface NLPTestCase {
  input: string;
  expectedIntent: 'LOG_EXPENSE' | 'LOG_INCOME' | null;
  expectedAmount: number | null;
  expectedCurrency?: string;
  expectedCategoryHint?: string;
}

export const nlpTestCases: NLPTestCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // Section A: Fast Path — Expense Pattern 1 (verb amount [on/for] desc)
  // ═══════════════════════════════════════════════════════════════════════════
  { input: "spent 50 on lunch", expectedIntent: "LOG_EXPENSE", expectedAmount: 50 },
  { input: "paid 1200 for rent", expectedIntent: "LOG_EXPENSE", expectedAmount: 1200 },
  { input: "bought coffee for 4.50", expectedIntent: "LOG_EXPENSE", expectedAmount: 4.50 },
  { input: "beli bensin 50k", expectedIntent: "LOG_EXPENSE", expectedAmount: 50000 },
  { input: "bayar listrik 150000", expectedIntent: "LOG_EXPENSE", expectedAmount: 150000 },
  { input: "jajan 15k", expectedIntent: "LOG_EXPENSE", expectedAmount: 15000 },
  { input: "spent 200 on groceries", expectedIntent: "LOG_EXPENSE", expectedAmount: 200 },
  { input: "paid 35 for parking", expectedIntent: "LOG_EXPENSE", expectedAmount: 35 },
  { input: "bought shoes for 120", expectedIntent: "LOG_EXPENSE", expectedAmount: 120 },
  { input: "makan 25k", expectedIntent: "LOG_EXPENSE", expectedAmount: 25000 },
  { input: "bayar 80000 buat wifi", expectedIntent: "LOG_EXPENSE", expectedAmount: 80000 },
  { input: "spent 99.99 on Netflix", expectedIntent: "LOG_EXPENSE", expectedAmount: 99.99 },
  { input: "beli pulsa 50000", expectedIntent: "LOG_EXPENSE", expectedAmount: 50000 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Section B: Fast Path — Expense Pattern 2 (verb desc amount)
  // ═══════════════════════════════════════════════════════════════════════════
  { input: "bought lunch 12.50", expectedIntent: "LOG_EXPENSE", expectedAmount: 12.50 },
  { input: "paid electricity 200k", expectedIntent: "LOG_EXPENSE", expectedAmount: 200000 },
  { input: "beli baju 350k", expectedIntent: "LOG_EXPENSE", expectedAmount: 350000 },
  { input: "bayar internet 500000", expectedIntent: "LOG_EXPENSE", expectedAmount: 500000 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Section C: Fast Path — Income Pattern 1 (verb amount [from/dari] desc)
  // ═══════════════════════════════════════════════════════════════════════════
  { input: "earned 3000 from salary", expectedIntent: "LOG_INCOME", expectedAmount: 3000 },
  { input: "received 500 from freelance", expectedIntent: "LOG_INCOME", expectedAmount: 500 },
  { input: "dapat bonus 1000k", expectedIntent: "LOG_INCOME", expectedAmount: 1000000 },
  { input: "terima 200 dari budi", expectedIntent: "LOG_INCOME", expectedAmount: 200 },
  { input: "earned 5000 from project", expectedIntent: "LOG_INCOME", expectedAmount: 5000 },
  { input: "received 100 from refund", expectedIntent: "LOG_INCOME", expectedAmount: 100 },
  { input: "dapet 2500k dari gaji", expectedIntent: "LOG_INCOME", expectedAmount: 2500000 },
  { input: "terima 150000 dari transfer", expectedIntent: "LOG_INCOME", expectedAmount: 150000 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Section D: Fast Path — Income Pattern 2 (verb desc amount)
  // ═══════════════════════════════════════════════════════════════════════════
  { input: "dapat thr 500k", expectedIntent: "LOG_INCOME", expectedAmount: 500000 },
  { input: "terima cashback 25000", expectedIntent: "LOG_INCOME", expectedAmount: 25000 },
  { input: "received payment 750", expectedIntent: "LOG_INCOME", expectedAmount: 750 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Section E: Fast Path — Bare Amount + Description (defaults to expense)
  // ═══════════════════════════════════════════════════════════════════════════
  { input: "45 groceries", expectedIntent: "LOG_EXPENSE", expectedAmount: 45 },
  { input: "15k makan siang", expectedIntent: "LOG_EXPENSE", expectedAmount: 15000 },
  { input: "Rp50000 pulsa", expectedIntent: "LOG_EXPENSE", expectedAmount: 50000, expectedCurrency: "IDR" },
  { input: "$100 freelance", expectedIntent: "LOG_EXPENSE", expectedAmount: 100, expectedCurrency: "USD" },
  { input: "25k parkir", expectedIntent: "LOG_EXPENSE", expectedAmount: 25000 },
  { input: "10 snack", expectedIntent: "LOG_EXPENSE", expectedAmount: 10 },
  { input: "€30 museum ticket", expectedIntent: "LOG_EXPENSE", expectedAmount: 30, expectedCurrency: "EUR" },
  { input: "£45 dinner", expectedIntent: "LOG_EXPENSE", expectedAmount: 45, expectedCurrency: "GBP" },
  { input: "150000 belanja online", expectedIntent: "LOG_EXPENSE", expectedAmount: 150000 },
  { input: "2.5k coffee", expectedIntent: "LOG_EXPENSE", expectedAmount: 2500 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Section F: Currency Detection
  // ═══════════════════════════════════════════════════════════════════════════
  { input: "spent $75 on dinner", expectedIntent: "LOG_EXPENSE", expectedAmount: 75, expectedCurrency: "USD" },
  { input: "bayar Rp200000 sewa", expectedIntent: "LOG_EXPENSE", expectedAmount: 200000, expectedCurrency: "IDR" },
  { input: "paid €15 for wine", expectedIntent: "LOG_EXPENSE", expectedAmount: 15, expectedCurrency: "EUR" },
  { input: "spent RM50 on taxi", expectedIntent: "LOG_EXPENSE", expectedAmount: 50, expectedCurrency: "MYR" },

  // ═══════════════════════════════════════════════════════════════════════════
  // Section G: Complex inputs (designed for AI fallback, tested via mocked AI)
  // ═══════════════════════════════════════════════════════════════════════════
  { input: "I just got paid my salary of 5000 dollars", expectedIntent: "LOG_INCOME", expectedAmount: 5000 },
  { input: "Had a great dinner with friends, it cost me 150", expectedIntent: "LOG_EXPENSE", expectedAmount: 150 },

  // ═══════════════════════════════════════════════════════════════════════════
  // Section H: Non-financial inputs (should return null)
  // ═══════════════════════════════════════════════════════════════════════════
  { input: "hello bot", expectedIntent: null, expectedAmount: null },
  { input: "what is my budget?", expectedIntent: null, expectedAmount: null },
  { input: "thank you!", expectedIntent: null, expectedAmount: null },
  { input: "hi", expectedIntent: null, expectedAmount: null },
  { input: "ok thanks", expectedIntent: null, expectedAmount: null },
  { input: "how are you?", expectedIntent: null, expectedAmount: null },
  { input: "yes", expectedIntent: null, expectedAmount: null },
  { input: "nope", expectedIntent: null, expectedAmount: null },
  { input: "bye!", expectedIntent: null, expectedAmount: null },
  { input: "what time is it", expectedIntent: null, expectedAmount: null },
];
