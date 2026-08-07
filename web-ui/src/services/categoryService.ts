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

// CreateCategoryData and UpdateCategoryData were the request shapes for the
// three deleted methods below and had no other reader. The contract they
// described is now in swagger — `Category` for POST and `CategoryUpdate` for
// PUT/PATCH — which is the point of documenting the request bodies: the shapes
// live in one place the server owns, instead of being retyped per client.

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

  // getCategory, createCategory and updateCategory lived here and are deleted.
  //
  // Nothing called them. Categories.tsx uses getCategories and deleteCategory
  // and does its own create/edit inline, so the three were unreachable from any
  // screen — checked by following the chain rather than grepping the service,
  // because a generic hook factory can call a method without ever naming it.
  //
  // Two of them were also WRONG, which is why they are deleted rather than
  // wired up: both read `response.data.category`, but `GET /categories/{id}`
  // returns a flat object and `PUT` returns `{message}` only, so each would
  // have resolved to `undefined`. (`POST` does return that key — the roadmap
  // note claiming no handler returns it is mistaken, and createCategory was the
  // one correct member of the three. It goes too: it had no callers either, and
  // POST /categories now carries a documented request model, so regenerating it
  // is a one-liner if a screen ever needs it.)

  /**
   * Delete a category
   */
  async deleteCategory(id: number): Promise<void> {
    await api.delete(`/api/v1/categories/${id}`);
  },

};

export default categoryService;
