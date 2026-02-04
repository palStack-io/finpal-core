import { api } from '../api';
import { API_CONFIG } from '../../config/api';

export interface GroupMember {
  id: string;
  email: string;
  name: string;
}

export interface Group {
  id: number;
  name: string;
  description: string;
  created_by: string;
  default_split_method: 'equal' | 'percentage' | 'custom' | 'shares';
  default_payer?: string;
  auto_include_all: boolean;
  members: GroupMember[];
}

export interface GroupsResponse {
  groups: Group[];
}

export const groupsApi = {
  // Get all groups
  getAll: async (): Promise<GroupsResponse> => {
    const response = await api.get<GroupsResponse>('/api/v1/groups');
    return response.data;
  },

  // Get single group
  get: async (id: number): Promise<Group> => {
    const response = await api.get<Group>(`/api/v1/groups/${id}`);
    return response.data;
  },

  // Create group
  create: async (data: Partial<Group> & { member_ids?: string[] }): Promise<{ message: string; group_id: number }> => {
    const response = await api.post('/api/v1/groups', data);
    return response.data;
  },

  // Update group
  update: async (id: number, data: Partial<Group>): Promise<{ message: string }> => {
    const response = await api.put(`/api/v1/groups/${id}`, data);
    return response.data;
  },

  // Delete group
  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/api/v1/groups/${id}`);
    return response.data;
  },
};
