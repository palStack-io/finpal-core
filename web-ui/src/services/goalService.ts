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


/**
 * What an emergency fund would need to be, in the caller's own figures.
 *
 * *** `null` IS A REAL ANSWER. *** A caller with no spending recorded has no
 * essential monthly cost, and "you need $0.00" is a sentence finPal cannot
 * justify — the same fail-closed rule the coin payoffs follow.
 */
export interface BufferPicture {
  /** What arrives whatever you do, per month. The divisor, stated. */
  essential_monthly: number;
  /** Cash reachable this week: checking + savings, positive balances only. */
  held: number;
  months_covered: number;
  /** Three and six, offered as options. finPal recommends neither. */
  targets: Array<{
    months: number;
    target: number;
    /** Negative means already past it. NOT clamped — that is worth knowing. */
    short_by: number;
  }>;
}

/** A goal the caller's own figures argue for. Never paid for; see `acts.py`. */
export interface GoalSuggestion {
  kind: 'savings' | 'payoff';
  headline: string;
  /** The condition finPal observed, so the premise can be disagreed with. */
  because: string;
  lesson_slug: string;
  check: string;
}

export interface DebtPlan {
  method: 'avalanche' | 'snowball';
  /** `null` is allowed: the ordering is useful before an amount is known. */
  monthly_amount: number | null;
  /** What the chosen method implies, stated back. Absent on a write. */
  order?: Array<{ id: number; name: string; balance: number; apr: number | null }>;
}

export const goalService = {

  /** `null` when finPal cannot say — never a zero target. */
  async getBufferPicture(): Promise<BufferPicture | null> {
    const response = await api.get<{ success: boolean; buffer: BufferPicture | null }>(
      '/api/v1/goals/buffer-picture');
    return response.data.buffer;
  },

  /** `[]` is a fine answer: a page that always has advice has none. */
  async getSuggestions(): Promise<GoalSuggestion[]> {
    const response = await api.get<{ success: boolean; suggestions: GoalSuggestion[] }>(
      '/api/v1/goals/suggestions');
    return response.data.suggestions;
  },

  async getDebtPlan(): Promise<DebtPlan | null> {
    const response = await api.get<{ success: boolean; plan: DebtPlan | null }>(
      '/api/v1/goals/debt-plan');
    return response.data.plan;
  },

  /**
   * *** OMIT `monthly_amount` TO LEAVE IT UNCHANGED. *** Sending `null` is not
   * the same as omitting it: somebody switching ordering should not silently
   * lose the figure they recorded.
   */
  async setDebtPlan(method: 'avalanche' | 'snowball', monthlyAmount?: number): Promise<DebtPlan> {
    const body: Record<string, unknown> = { method };
    if (monthlyAmount !== undefined) body.monthly_amount = monthlyAmount;
    const response = await api.put<{ success: boolean; plan: DebtPlan }>(
      '/api/v1/goals/debt-plan', body);
    return response.data.plan;
  },
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
