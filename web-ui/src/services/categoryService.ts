/**
 * Category Service
 * Handles all category-related API calls
 */

import { api } from './api';

export interface Category {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  parent_id?: number;
  user_id: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCategoryData {
  name: string;
  icon?: string;
  color?: string;
  parent_id?: number;
}

export interface UpdateCategoryData {
  name?: string;
  icon?: string;
  color?: string;
  parent_id?: number;
}

export interface CategoryMapping {
  id: number;
  pattern: string;
  category_id: number;
  match_type: 'exact' | 'contains' | 'regex';
  user_id: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCategoryMappingData {
  pattern: string;
  category_id: number;
  match_type?: 'exact' | 'contains' | 'regex';
}

export const categoryService = {
  /**
   * Get all categories for current user
   */
  async getCategories(): Promise<Category[]> {
    const response = await api.get<{ success: boolean; categories: Category[] }>(
      '/api/v1/categories'
    );
    return response.data.categories;
  },

  /**
   * Get a specific category by ID
   */
  async getCategory(id: number): Promise<Category> {
    const response = await api.get<{ success: boolean; category: Category }>(
      `/api/v1/categories/${id}`
    );
    return response.data.category;
  },

  /**
   * Create a new category
   */
  async createCategory(data: CreateCategoryData): Promise<Category> {
    const response = await api.post<{
      success: boolean;
      category: Category;
      message: string;
    }>('/api/v1/categories', data);
    return response.data.category;
  },

  /**
   * Update a category
   */
  async updateCategory(id: number, data: UpdateCategoryData): Promise<Category> {
    const response = await api.put<{
      success: boolean;
      category: Category;
      message: string;
    }>(`/api/v1/categories/${id}`, data);
    return response.data.category;
  },

  /**
   * Delete a category
   */
  async deleteCategory(id: number): Promise<void> {
    await api.delete(`/api/v1/categories/${id}`);
  },

  /**
   * Get all category mappings
   */
  async getCategoryMappings(): Promise<CategoryMapping[]> {
    const response = await api.get<{
      success: boolean;
      mappings: CategoryMapping[];
    }>('/api/v1/categories/mappings');
    return response.data.mappings;
  },

  /**
   * Create a new category mapping
   */
  async createCategoryMapping(
    data: CreateCategoryMappingData
  ): Promise<CategoryMapping> {
    const response = await api.post<{
      success: boolean;
      mapping: CategoryMapping;
      message: string;
    }>('/api/v1/categories/mappings', data);
    return response.data.mapping;
  },

  /**
   * Delete a category mapping
   */
  async deleteCategoryMapping(id: number): Promise<void> {
    await api.delete(`/api/v1/categories/mappings/${id}`);
  },

  /**
   * Bulk categorize transactions based on mappings
   */
  async bulkCategorize(transactionIds?: number[]): Promise<{
    categorized_count: number;
    transactions: number[];
  }> {
    const response = await api.post<{
      success: boolean;
      categorized_count: number;
      transactions: number[];
      message: string;
    }>('/api/v1/categories/bulk-categorize', {
      transaction_ids: transactionIds,
    });
    return {
      categorized_count: response.data.categorized_count,
      transactions: response.data.transactions,
    };
  },

  /**
   * Get category spending summary
   */
  async getCategorySpending(
    startDate?: string,
    endDate?: string
  ): Promise<Array<{
    category_id: number;
    category_name: string;
    total_spent: number;
    transaction_count: number;
  }>> {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await api.get<{
      success: boolean;
      categories: Array<{
        category_id: number;
        category_name: string;
        total_spent: number;
        transaction_count: number;
      }>;
    }>(`/api/v1/categories/spending?${params.toString()}`);
    return response.data.categories;
  },
};

export default categoryService;
