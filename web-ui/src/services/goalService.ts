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

  /**
   * B12. *** ITS OWN ROUTE AND NOT A `PUT`, AND THE SERVER REFUSES `account_ids`
   * ON `PUT` SO THAT THIS IS NOT OPTIONAL. *** Adding an account snapshots its
   * balance NOW and extends the goal's denominator by that amount, so the
   * percentage moves for a stated reason rather than jumping; a `PUT` that
   * restated the set would rewrite a percentage the user has already seen.
   */
  async addGoalAccount(id: number, accountId: number): Promise<Goal> {
    const response = await api.post<{ success: boolean; goal: Goal }>(
      `/api/v1/goals/${id}/accounts`,
      { account_id: accountId },
    );
    return response.data.goal;
  },

  /**
   * Shrinks the denominator by THAT account's own snapshot. The server refuses
   * to remove the last one — that is a conversion to a manual goal, not an
   * unlink — so gate the control on `canUnlinkAccounts` rather than offering a
   * button that can only fail.
   */
  async removeGoalAccount(id: number, accountId: number): Promise<Goal> {
    const response = await api.delete<{ success: boolean; goal: Goal }>(
      `/api/v1/goals/${id}/accounts/${accountId}`,
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
