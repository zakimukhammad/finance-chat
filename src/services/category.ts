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
}
