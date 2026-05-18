import { CategoryService } from '../category';
import { Category } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Maps a free-text category hint (from NLP) to the best matching Category.
 * Uses simple keyword matching against known category names.
 */

// Keyword → category name mapping for common words
const CATEGORY_KEYWORDS: Record<string, string> = {
  // Expense categories
  'food': 'Food & Dining',
  'lunch': 'Food & Dining',
  'dinner': 'Food & Dining',
  'breakfast': 'Food & Dining',
  'coffee': 'Food & Dining',
  'kopi': 'Food & Dining',
  'makan': 'Food & Dining',
  'snack': 'Food & Dining',
  'jajan': 'Food & Dining',
  'restaurant': 'Food & Dining',
  'groceries': 'Food & Dining',
  'belanja': 'Food & Dining',
  'nasi': 'Food & Dining',
  'ayam': 'Food & Dining',
  'bakso': 'Food & Dining',
  'warung': 'Food & Dining',

  'transport': 'Transport',
  'taxi': 'Transport',
  'grab': 'Transport',
  'gojek': 'Transport',
  'ojek': 'Transport',
  'uber': 'Transport',
  'gas': 'Transport',
  'petrol': 'Transport',
  'bensin': 'Transport',
  'fuel': 'Transport',
  'bus': 'Transport',
  'train': 'Transport',
  'kereta': 'Transport',
  'parkir': 'Transport',
  'parking': 'Transport',
  'toll': 'Transport',
  'tol': 'Transport',

  'rent': 'Housing & Rent',
  'sewa': 'Housing & Rent',
  'kos': 'Housing & Rent',
  'kost': 'Housing & Rent',
  'housing': 'Housing & Rent',
  'apartment': 'Housing & Rent',

  'electric': 'Utilities',
  'electricity': 'Utilities',
  'listrik': 'Utilities',
  'water': 'Utilities',
  'air': 'Utilities',
  'internet': 'Utilities',
  'wifi': 'Utilities',
  'phone': 'Utilities',
  'pulsa': 'Utilities',
  'paket data': 'Utilities',

  'doctor': 'Health & Medical',
  'hospital': 'Health & Medical',
  'medicine': 'Health & Medical',
  'obat': 'Health & Medical',
  'dokter': 'Health & Medical',
  'apotek': 'Health & Medical',
  'pharmacy': 'Health & Medical',
  'gym': 'Health & Medical',
  'health': 'Health & Medical',

  'movie': 'Entertainment',
  'film': 'Entertainment',
  'bioskop': 'Entertainment',
  'game': 'Entertainment',
  'gaming': 'Entertainment',
  'concert': 'Entertainment',
  'konser': 'Entertainment',
  'entertainment': 'Entertainment',
  'hiburan': 'Entertainment',
  'spotify': 'Subscriptions',

  'clothes': 'Shopping',
  'baju': 'Shopping',
  'shoes': 'Shopping',
  'sepatu': 'Shopping',
  'shopping': 'Shopping',
  'belanja online': 'Shopping',
  'tokopedia': 'Shopping',
  'shopee': 'Shopping',

  'book': 'Education',
  'buku': 'Education',
  'course': 'Education',
  'kursus': 'Education',
  'tuition': 'Education',
  'school': 'Education',
  'sekolah': 'Education',
  'kuliah': 'Education',

  'flight': 'Travel',
  'hotel': 'Travel',
  'travel': 'Travel',
  'vacation': 'Travel',
  'liburan': 'Travel',
  'holiday': 'Travel',

  'subscription': 'Subscriptions',
  'netflix': 'Subscriptions',
  'youtube': 'Subscriptions',
  'langganan': 'Subscriptions',

  'gift': 'Gifts & Donations',
  'hadiah': 'Gifts & Donations',
  'kado': 'Gifts & Donations',
  'donation': 'Gifts & Donations',
  'donasi': 'Gifts & Donations',
  'sedekah': 'Gifts & Donations',
  'infaq': 'Gifts & Donations',
  'zakat': 'Gifts & Donations',

  'repair': 'Maintenance',
  'service': 'Maintenance',
  'servis': 'Maintenance',
  'fix': 'Maintenance',
  'perbaikan': 'Maintenance',

  'pet': 'Pets',
  'kucing': 'Pets',
  'anjing': 'Pets',
  'cat': 'Pets',
  'dog': 'Pets',

  // Income categories
  'salary': 'Salary',
  'gaji': 'Salary',
  'paycheck': 'Salary',

  'invest': 'Investment',
  'dividend': 'Investment',
  'dividen': 'Investment',
  'interest': 'Investment',
  'bunga': 'Investment',

  'freelance': 'Freelance',
  'freelancing': 'Freelance',
  'project': 'Freelance',
  'proyek': 'Freelance',
  'side hustle': 'Freelance',

  'bonus': 'Bonus / Gift',
  'thr': 'Bonus / Gift',

  'refund': 'Refund',
  'cashback': 'Refund',
  'return': 'Refund',
  'pengembalian': 'Refund',
};

/**
 * Match a category hint string to the best Category from the database.
 */
export async function matchCategory(
  hint: string | null,
  type: 'expense' | 'income'
): Promise<Category | null> {
  if (!hint) return null;

  const categories = await CategoryService.getByType(type);
  const lowerHint = hint.toLowerCase();

  // 1. Try exact keyword match
  for (const [keyword, catName] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lowerHint.includes(keyword)) {
      const match = categories.find(c => c.name === catName);
      if (match) {
        logger.debug({ hint, matched: match.name }, 'Category matched via keyword');
        return match;
      }
    }
  }

  // 2. Try fuzzy match against category names
  for (const cat of categories) {
    if (lowerHint.includes(cat.name.toLowerCase()) || cat.name.toLowerCase().includes(lowerHint)) {
      logger.debug({ hint, matched: cat.name }, 'Category matched via name fuzzy');
      return cat;
    }
  }

  // 3. Return null — caller will ask the user to pick
  logger.debug({ hint }, 'No category match found for hint');
  return null;
}
