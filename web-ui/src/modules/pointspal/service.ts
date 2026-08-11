/**
 * pointsPal Service
 * All API calls for the pointsPal rewards optimization module
 */

import { api } from '../../services/api';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RecommendedSwitch {
  card_name: string;
  rate: number;
  cap: number | null;
}

export interface CapCard {
  category: string;
  emoji: string;
  card_name: string;
  cap_amount: number | null;
  cap_period: string;
  spent: number;
  cap_pct: number;
  status: 'ok' | 'warning' | 'capped';
  effective_rate: number;
  normal_rate: number;
  room_left: number;
  resets_at: string;
  recommended_switch: RecommendedSwitch | null;
}

export interface UpcomingReset {
  category: string;
  card_name: string;
  resets_at: string;
  period: string;
}

export interface CapSummary {
  period: string;
  pts_earned: number;
  pts_at_normal: number;
  pts_at_fallback: number;
  pts_missed: number;
  value_missed_usd: number;
  active_alerts: number;
  upcoming_resets: UpcomingReset[];
}

export interface EarnCap {
  category: string;
  rate: number;
  cap_amount: number | null;
  cap_period: string | null;
}

export interface WalletCard {
  id: number;
  card_name: string;
  issuer: string;
  program: string;
  issuer_color: 'chase' | 'amex' | 'citi' | 'cap1' | 'default';
  last_four: string;
  points: number;
  est_value_usd: number;
  annual_fee: number;
  avg_rate_ytd: number;
  verified_at: string;
  stale_status: string;
  expiry_alert: string | null;
  earn_caps: EarnCap[];
  /**
   * Whether a community contribution LINK has been generated for this card — not whether an
   * issue was actually filed. GitHub cannot call back, so someone who opens the pre-filled
   * issue and closes the tab is still recorded here. Render it as "opened", never
   * "contributed".
   *
   * The endpoint has always sent this; the interface simply never declared it, so the code
   * that refreshed the cards "so submitted_to_community updates" was reading a field
   * TypeScript did not believe existed. An interface is a claim about a server, not a check
   * of one.
   */
  submitted_to_community?: boolean;
}

export interface RecommendCard {
  card_name: string;
  program: string;
  nominal_rate: number;
  effective_rate: number;
  pts_earned: number;
  value_usd: number;
  status: 'ok' | 'warning' | 'capped';
  cap_pct: number | null;
  tag: 'best' | 'good' | 'ok' | 'capped';
}

export interface DisplacedWinner {
  card_name: string;
  normal_rate: number;
  status: string;
  cap_note: string;
}

export interface RecommendationResult {
  category: string;
  amount: number;
  winner: {
    card_name: string;
    pts_earned: number;
    value_usd: number;
    effective_rate: number;
    cap_note: string | null;
  };
  displaced_winner?: DisplacedWinner;
  all_cards: RecommendCard[];
}

export interface CardTransaction {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: number;
  rate: number;
  pts_earned: number;
}

export interface Alert {
  id: number;
  type: string;
  message: string;
  dismissed: boolean;
  created_at: string;
}

export interface ActionItem {
  type: 'capped' | 'warning' | 'opportunity';
  emoji: string;
  title: string;
  description: string;
  value: string;
  value_label: string;
  link_to: string;
}

export interface RecentActivity {
  card_name: string;
  dot_color: string;
  description: string;
  subtitle: string;
  pts_earned: number;
  pts_missed: number;
}

export interface OverviewCard {
  id: number;
  card_name: string;
  program: string;
  issuer_color: 'chase' | 'amex' | 'citi' | 'cap1' | 'default';
  points: number;
  est_value_usd: number;
  annual_fee: number;
  expiry_alert: string | null;
  stale: boolean;
}

export interface StaleCard {
  id: number;
  card_name: string;
  stale_status: string;
  issuer_updated_at: string;
}

export interface Program {
  program_id: string;
  program_name: string;
  issuer: string;
  network: string | null;
  annual_fee: number | null;
  effective_annual_fee: string | null;
  base_cpp: number | null;
  tpg_cpp: number | null;
  data_as_of: string | null;
  is_stale: boolean;
}

export interface Overview {
  total_value_usd: number;
  pts_earned_this_month: number;
  pts_missed_this_month: number;
  active_cap_alerts: number;
  max_redeemable_usd: number;
  cards: OverviewCard[];
  stale_cards: StaleCard[];
  action_items: ActionItem[];
  recent_activity: RecentActivity[];
}

export interface RedemptionOption {
  partner: string;
  description: string;
  type: 'Transfer' | 'Portal' | 'Cash';
  cpp: number;
  tag: 'Best' | 'Good' | 'OK' | 'Avoid';
}

export interface RedemptionProgram {
  program_name: string;
  points: number;
  dot_color: string;
  options: RedemptionOption[];
}

export interface RedemptionOverview {
  total_value_usd: number;
  max_redeemable_usd: number;
  total_points: number;
  card_count: number;
  programs: RedemptionProgram[];
  tips: Array<{ type: string; title: string; body: string }>;
}

// ── API calls ──────────────────────────────────────────────────────────────

const BASE = '/api/v1/pointspal';

export const pointspalService = {
  async getOverview(): Promise<Overview> {
    const response = await api.get<Overview>(`${BASE}/overview`);
    return response.data;
  },

  async getCaps(period = 'monthly'): Promise<CapCard[]> {
    const response = await api.get<CapCard[]>(`${BASE}/caps?period=${period}`);
    return response.data;
  },

  async getCapSummary(period = 'monthly'): Promise<CapSummary> {
    const response = await api.get<CapSummary>(`${BASE}/caps/summary?period=${period}`);
    return response.data;
  },

  async getCards(): Promise<WalletCard[]> {
    const response = await api.get<WalletCard[]>(`${BASE}/cards`);
    return response.data;
  },

  async addCard(data: Record<string, unknown>): Promise<WalletCard> {
    const response = await api.post<{ card: WalletCard }>(`${BASE}/cards`, data);
    return response.data.card;
  },

  async updateCard(id: number, data: Record<string, unknown>): Promise<WalletCard> {
    const response = await api.put<{ card: WalletCard }>(`${BASE}/cards/${id}`, data);
    return response.data.card;
  },

  async deleteCard(id: number): Promise<void> {
    await api.delete(`${BASE}/cards/${id}`);
  },

  async verifyCard(id: number): Promise<void> {
    await api.post(`${BASE}/cards/${id}/verify`);
  },

  async searchPrograms(q: string): Promise<Program[]> {
    const response = await api.get<Program[]>(`/api/v1/points/programs?q=${encodeURIComponent(q)}`);
    return response.data;
  },

  async createCardLink(data: { simplefin_account_id: string; user_card_id: number; is_credit_card?: boolean; simplefin_account_name?: string }): Promise<void> {
    await api.post(`/api/v1/wallet/simplefin/links`, data);
  },

  async generatePrUrl(cardId: number): Promise<string> {
    const response = await api.get<{ pr_url: string }>(`${BASE}/cards/${cardId}/pr-url`);
    return response.data.pr_url;
  },

  async getRecommendation(category: string, amount: number): Promise<RecommendationResult> {
    const response = await api.get<RecommendationResult>(
      `${BASE}/recommend?category=${encodeURIComponent(category)}&amount=${amount}`
    );
    return response.data;
  },

  async getAlerts(): Promise<Alert[]> {
    const response = await api.get<Alert[]>(`${BASE}/alerts`);
    return response.data;
  },

  async dismissAlert(id: number): Promise<void> {
    await api.post(`${BASE}/alerts/${id}/dismiss`);
  },

  async getRedemptionOptions(): Promise<RedemptionOverview> {
    const response = await api.get<RedemptionOverview>(`${BASE}/redeem`);
    return response.data;
  },

  async getCardTransactions(cardId: number): Promise<CardTransaction[]> {
    const response = await api.get<CardTransaction[]>(`${BASE}/cards/${cardId}/transactions`);
    return response.data;
  },
};

export default pointspalService;
