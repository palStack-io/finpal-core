import { api } from '../api';
import { API_CONFIG } from '../../config/api';

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  parent_id?: number;
  is_system: boolean;
}

export interface CategoriesResponse {
  categories: Category[];
}

export const categoriesApi = {
  // Get all categories
  getAll: async (): Promise<CategoriesResponse> => {
    const response = await api.get<CategoriesResponse>('/api/v1/categories');
    return response.data;
  },

  // Get single category
  get: async (id: number): Promise<Category> => {
    const response = await api.get<Category>(`/api/v1/categories/${id}`);
    return response.data;
  },

  // Create category
  create: async (data: Partial<Category>): Promise<{ message: string; category_id: number }> => {
    const response = await api.post('/api/v1/categories', data);
    return response.data;
  },

  // Update category
  update: async (id: number, data: Partial<Category>): Promise<{ message: string }> => {
    const response = await api.put(`/api/v1/categories/${id}`, data);
    return response.data;
  },

  // Delete category
  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/api/v1/categories/${id}`);
    return response.data;
  },
};
