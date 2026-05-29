import { getSupabase } from '../db/client';
import { Category } from '../types';

export class CategoryService {
  static async getAll(): Promise<Category[]> {
    const { data, error } = await getSupabase()
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data as Category[];
  }

  static async getByType(type: 'expense' | 'income' | 'both'): Promise<Category[]> {
    const { data, error } = await getSupabase()
      .from('categories')
      .select('*')
      .or(`type.eq.${type},type.eq.both`)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data as Category[];
  }

  static async getById(id: string): Promise<Category | null> {
    const { data, error } = await getSupabase()
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return data as Category;
  }

  static async getByName(name: string): Promise<Category | null> {
    const { data, error } = await getSupabase()
      .from('categories')
      .select('*')
      .ilike('name', name)
      .limit(1);

    if (error) throw error;
    return data && data.length > 0 ? (data[0] as Category) : null;
  }

  static async add(name: string, icon: string, type: 'expense' | 'income' | 'both'): Promise<Category> {
    if (!name || name.trim().length === 0) {
      throw new Error('Category name cannot be empty.');
    }
    if (name.length > 30) {
      throw new Error('Category name cannot exceed 30 characters.');
    }

    // Emoji check
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const segments = Array.from(segmenter.segment(icon));
    if (segments.length !== 1) {
      throw new Error('Icon must be a single emoji.');
    }
    const emojiRegex = /[\p{Emoji_Presentation}\p{Emoji_Modifier_Base}\p{Emoji_Component}]/u;
    if (!emojiRegex.test(icon)) {
      throw new Error('Icon must be a valid emoji.');
    }

    // Check uniqueness (case-insensitive)
    const existing = await this.getByName(name);
    if (existing) {
      throw new Error('Category name already exists.');
    }

    // Get next sort_order
    const { data: maxCat, error: maxError } = await getSupabase()
      .from('categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);

    if (maxError) throw maxError;
    const sortOrder = maxCat && maxCat.length > 0 ? (maxCat[0].sort_order || 0) + 1 : 0;

    const { data, error } = await getSupabase()
      .from('categories')
      .insert({
        name: name.trim(),
        icon,
        type,
        is_system: false,
        sort_order: sortOrder,
        color: '#BFC9CA', // default color
      })
      .select()
      .single();

    if (error) throw error;
    return data as Category;
  }

  static async delete(id: string): Promise<void> {
    // Check if any transaction references this category
    const { count, error: countError } = await getSupabase()
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id);

    if (countError) throw countError;

    if (count && count > 0) {
      throw new Error(`Cannot delete — used by ${count} transactions.`);
    }

    const { error: deleteError } = await getSupabase()
      .from('categories')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;
  }
}

