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

};

export default categoryService;
