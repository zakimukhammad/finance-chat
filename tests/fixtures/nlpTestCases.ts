export interface NLPTestCase {
  input: string;
  expectedIntent: 'LOG_EXPENSE' | 'LOG_INCOME' | null;
  expectedAmount: number | null;
  expectedCurrency?: string;
  expectedCategoryHint?: string;
}

export const nlpTestCases: NLPTestCase[] = [
  // Fast Path: Expense Pattern
  { input: "spent 50 on lunch", expectedIntent: "LOG_EXPENSE", expectedAmount: 50, expectedCategoryHint: "lunch" },
  { input: "paid 1200 for rent", expectedIntent: "LOG_EXPENSE", expectedAmount: 1200, expectedCategoryHint: "rent" },
  { input: "bought coffee for 4.50", expectedIntent: "LOG_EXPENSE", expectedAmount: 4.50, expectedCategoryHint: "coffee for 4.50" }, // Simple regex might capture trailing parts
  { input: "beli bensin 50k", expectedIntent: "LOG_EXPENSE", expectedAmount: 50000, expectedCategoryHint: "bensin 50k" },
  { input: "bayar listrik 150000", expectedIntent: "LOG_EXPENSE", expectedAmount: 150000, expectedCategoryHint: "listrik 150000" },
  { input: "jajan 15k", expectedIntent: "LOG_EXPENSE", expectedAmount: 15000, expectedCategoryHint: "15k" },
  
  // Fast Path: Income Pattern
  { input: "earned 3000 from salary", expectedIntent: "LOG_INCOME", expectedAmount: 3000, expectedCategoryHint: "salary" },
  { input: "received 500 from freelance", expectedIntent: "LOG_INCOME", expectedAmount: 500, expectedCategoryHint: "freelance" },
  { input: "dapat bonus 1000k", expectedIntent: "LOG_INCOME", expectedAmount: 1000000, expectedCategoryHint: "bonus 1000k" },
  { input: "terima 200 dari budi", expectedIntent: "LOG_INCOME", expectedAmount: 200, expectedCategoryHint: "budi" },

  // Fast Path: Bare Amount Pattern
  { input: "45 groceries", expectedIntent: "LOG_EXPENSE", expectedAmount: 45, expectedCategoryHint: "groceries" },
  { input: "15k makan siang", expectedIntent: "LOG_EXPENSE", expectedAmount: 15000, expectedCategoryHint: "makan siang" },
  { input: "Rp50000 pulsa", expectedIntent: "LOG_EXPENSE", expectedAmount: 50000, expectedCategoryHint: "pulsa", expectedCurrency: "IDR" },
  { input: "$100 freelance", expectedIntent: "LOG_EXPENSE", expectedAmount: 100, expectedCategoryHint: "freelance", expectedCurrency: "USD" }, // Note: Bare amount defaults to expense, AI handles the rest

  // Complex inputs (designed for AI fallback)
  { input: "I just got paid my salary of 5000 dollars", expectedIntent: "LOG_INCOME", expectedAmount: 5000 },
  { input: "Had a great dinner with friends, it cost me 150", expectedIntent: "LOG_EXPENSE", expectedAmount: 150 },
  
  // Non-financial inputs
  { input: "hello bot", expectedIntent: null, expectedAmount: null },
  { input: "what is my budget?", expectedIntent: null, expectedAmount: null },
  { input: "thank you!", expectedIntent: null, expectedAmount: null },
];
