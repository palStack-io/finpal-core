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

/**
 * How the current month is going against the plan.
 *
 * *** `paid` IS WHAT finPal COULD SEE, NOT WHAT THEY PAID. *** It counts
 * transfers recorded against a debt account, so somebody paying their card
 * from a bank finPal does not hold scores zero and reads as `behind`. The
 * panel prints that basis beside the figure; see `plan_status.py`.
 */
export interface DebtPlanStatus {
  method: 'avalanche' | 'snowball';
  planned: number;
  paid: number;
  /** Positive is ahead, negative behind. NOT clamped and NOT a verdict. */
  difference: number;
  state: 'ahead' | 'on' | 'behind';
}

export interface DebtPlan {
  method: 'avalanche' | 'snowball';
  /** `null` is allowed: the ordering is useful before an amount is known. */
  monthly_amount: number | null;
  /**
   * The code EVERY figure in this payload is in — `order` balances and the
   * `planned`/`paid` inside `status`.
   *
   * *** IT IS ONE CODE BECAUSE THE SERVER CONVERTS THEM ALL INTO IT. D-278. ***
   * Before this, the balances were sent straight off the row and a euro
   * household's dollar card rendered as `€600.00`: the panel had no per-figure
   * currency and reached for the first account's. Optional so an older server
   * still parses; the caller falls back to the page's own currency.
   */
  currency_code?: string;
  /** What the chosen method implies, stated back. Absent on a write. */
  order?: Array<{ id: number; name: string; balance: number; apr: number | null }>;
  /**
   * *** ABSENT ON A WRITE, `null` WHEN THERE IS NOTHING TO MEASURE. *** The
   * PUT returns method and amount only, so a caller that stores the write's
   * answer over the read's would blank the order and the status at the exact
   * moment the reader expects to see them. `setDebtPlan` therefore re-reads.
   */
  status?: DebtPlanStatus | null;
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
    await api.put<{ success: boolean; plan: DebtPlan }>(
      '/api/v1/goals/debt-plan', body);
    /* *** THE WRITE'S ANSWER IS NOT THE WHOLE PLAN. *** `PUT` returns method
       and amount only; `order` and `status` come from the read. Returning the
       write's payload would blank both the instant somebody picks a method,
       which is when they most expect the ordering to appear. */
    const plan = await goalService.getDebtPlan();
    return plan as DebtPlan;
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
