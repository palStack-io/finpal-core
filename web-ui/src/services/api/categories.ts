import axios from 'axios';
import { API_CONFIG } from '../../config/api';
import { useAuthStore } from '../../store/authStore';

const api = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
