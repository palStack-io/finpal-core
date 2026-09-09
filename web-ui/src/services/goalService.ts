/**
 * Goal Service
 *
 * No trailing slash, matching every other service here. The API sets
 * `url_map.strict_slashes = False`, so one rule answers both spellings.
 */

import { api } from './api';
import type {
  CreateGoalData,
  Goal,
  GoalContribution,
  UpdateGoalData,
} from '../types/goal';

export const goalService = {
  async getGoals(): Promise<Goal[]> {
    const response = await api.get<{ success: boolean; goals: Goal[] }>('/api/v1/goals');
    return response.data.goals;
  },

  async createGoal(data: CreateGoalData): Promise<Goal> {
    const response = await api.post<{ success: boolean; goal: Goal }>('/api/v1/goals', data);
    return response.data.goal;
  },

  async updateGoal(id: number, data: UpdateGoalData): Promise<Goal> {
    const response = await api.put<{ success: boolean; goal: Goal }>(
      `/api/v1/goals/${id}`,
      data,
    );
    return response.data.goal;
  },

  /**
   * Archiving, not a status write. It is also what RELEASES the account for a new
   * goal in the same direction -- the uniqueness index is `WHERE status='active'`.
   */
  async archiveGoal(id: number): Promise<Goal> {
    const response = await api.post<{ success: boolean; goal: Goal }>(
      `/api/v1/goals/${id}/archive`,
      {},
    );
    return response.data.goal;
  },

  async deleteGoal(id: number): Promise<void> {
    await api.delete(`/api/v1/goals/${id}`);
  },

  async getContributions(
    id: number,
  ): Promise<{ currency_code: string; contributions: GoalContribution[] }> {
    const response = await api.get<{
      success: boolean;
      currency_code: string;
      contributions: GoalContribution[];
    }>(`/api/v1/goals/${id}/contributions`);
    return {
      currency_code: response.data.currency_code,
      contributions: response.data.contributions,
    };
  },
};

export default goalService;
