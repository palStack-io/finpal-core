/**
 * API Service
 * Axios instance with interceptors for authentication
 */

import axios from 'axios';
import API_CONFIG from '../config/api';
import { useAuthStore } from '../store/authStore';

// Create axios instance
export const api = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const authState = useAuthStore.getState();
        const refreshToken = authState.refreshToken;

        if (refreshToken) {
          const response = await axios.post(
            `${API_CONFIG.baseURL}${API_CONFIG.endpoints.auth.refresh}`,
            {},
            {
              headers: { Authorization: `Bearer ${refreshToken}` },
            }
          );

          const { access_token } = response.data;
          authState.setToken(access_token);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } else {
          // No refresh token, redirect to login
          authState.logout();
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          return Promise.reject(new Error('No refresh token available'));
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        const authState = useAuthStore.getState();
        authState.logout();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
