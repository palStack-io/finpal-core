/**
 * Group Service
 * Handles all group and bill splitting API calls
 */

import { api } from './api';
import type { User } from '../types/user';

export interface Group {
  id: number;
  name: string;
  description?: string;
  created_by: string;
  members?: User[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateGroupData {
  name: string;
  description?: string;
  member_ids?: number[];
}

export interface UpdateGroupData {
  name?: string;
  description?: string;
  member_ids?: number[];
}

export interface GroupExpense {
  id: number;
  description: string;
  amount: number;
  date: string;
  paid_by: string;
  group_id: number;
  split_method: 'equal' | 'custom' | 'percentage';
  split_details?: Record<string, number>;
  created_at?: string;
  updated_at?: string;
}

export interface CreateGroupExpenseData {
  description: string;
  amount: number;
  date: string;
  paid_by: string;
  split_method?: 'equal' | 'custom' | 'percentage';
  split_details?: Record<string, number>;
}

export interface GroupBalance {
  user_id: string;
  user_name: string;
  balance: number;
  owes: Array<{ user_id: string; user_name: string; amount: number }>;
  owed_by: Array<{ user_id: string; user_name: string; amount: number }>;
}

export interface Settlement {
  id: number;
  group_id: number;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  date: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateSettlementData {
  from_user_id: string;
  to_user_id: string;
  amount: number;
  date: string;
  notes?: string;
}

export const groupService = {
  /**
   * Get all groups for current user
   */
  async getGroups(): Promise<Group[]> {
    const response = await api.get<{ success: boolean; groups: Group[] }>(
      '/api/v1/groups'
    );
    return response.data.groups;
  },

  /**
   * Get a specific group by ID
   */
  async getGroup(id: number): Promise<Group> {
    const response = await api.get<{ success: boolean; group: Group }>(
      `/api/v1/groups/${id}`
    );
    return response.data.group;
  },

  /**
   * Create a new group
   */
  async createGroup(data: CreateGroupData): Promise<Group> {
    const response = await api.post<{
      success: boolean;
      group: Group;
      message: string;
    }>('/api/v1/groups', data);
    return response.data.group;
  },

  /**
   * Update a group
   */
  async updateGroup(id: number, data: UpdateGroupData): Promise<Group> {
    const response = await api.put<{
      success: boolean;
      group: Group;
      message: string;
    }>(`/api/v1/groups/${id}`, data);
    return response.data.group;
  },

  /**
   * Delete a group
   */
  async deleteGroup(id: number): Promise<void> {
    await api.delete(`/api/v1/groups/${id}`);
  },

  /**
   * Get group members
   */
  async getGroupMembers(id: number): Promise<User[]> {
    const response = await api.get<{ success: boolean; members: User[] }>(
      `/api/v1/groups/${id}/members`
    );
    return response.data.members;
  },

  /**
   * Add member to group
   */
  async addGroupMember(groupId: number, userId: number): Promise<void> {
    await api.post(`/api/v1/groups/${groupId}/members`, { user_id: userId });
  },

  /**
   * Remove member from group
   */
  async removeGroupMember(groupId: number, userId: number): Promise<void> {
    await api.delete(`/api/v1/groups/${groupId}/members/${userId}`);
  },

  /**
   * Get group expenses
   */
  async getGroupExpenses(id: number): Promise<GroupExpense[]> {
    const response = await api.get<{ success: boolean; expenses: GroupExpense[] }>(
      `/api/v1/groups/${id}/expenses`
    );
    return response.data.expenses;
  },

  /**
   * Create a group expense
   */
  async createGroupExpense(
    groupId: number,
    data: CreateGroupExpenseData
  ): Promise<GroupExpense> {
    const response = await api.post<{
      success: boolean;
      expense: GroupExpense;
      message: string;
    }>(`/api/v1/groups/${groupId}/expenses`, data);
    return response.data.expense;
  },

  /**
   * Get group balances (who owes whom)
   */
  async getGroupBalances(id: number): Promise<GroupBalance[]> {
    const response = await api.get<{
      success: boolean;
      group_id: number;
      balances: GroupBalance[];
    }>(`/api/v1/groups/${id}/balances`);
    return response.data.balances;
  },

  /**
   * Record a settlement
   */
  async recordSettlement(
    groupId: number,
    data: CreateSettlementData
  ): Promise<Settlement> {
    const response = await api.post<{
      success: boolean;
      settlement: Settlement;
      message: string;
    }>(`/api/v1/groups/${groupId}/settle`, data);
    return response.data.settlement;
  },

  /**
   * Get settlements for a group
   */
  async getGroupSettlements(id: number): Promise<Settlement[]> {
    const response = await api.get<{
      success: boolean;
      settlements: Settlement[];
    }>(`/api/v1/groups/${id}/settlements`);
    return response.data.settlements;
  },
};

export default groupService;
