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
  default_split_method: 'equal' | 'percentage' | 'custom';
  default_payer?: string;
  auto_include_all: boolean;
  members: GroupMember[];
  /**
   * How many expenses are in this group.
   *
   * Zero is a real answer — the seeded demo's three groups have held none, and
   * a row that offered "View balances" on an empty group promised a page with
   * nothing on it. Optional because a server older than 2026-09-15 does not
   * send it, and absent must mean "unknown" rather than "empty".
   */
  expense_count?: number;
}

/**
 * The fields the server actually accepts on create.
 *
 * Moved here from the retired `services/groupService.ts`, and it is the RICHER of
 * the two: this signature used to be `Partial<Group> & { member_ids?: string[] }`,
 * which omitted `default_split_values` entirely and typed `member_ids` as strings
 * when callers send numbers. Converging on the newer module would have SILENTLY
 * NARROWED the contract — the older file was the one that had it right.
 *
 * All three of the split fields are accepted by `api/v1/groups.py` and are sent by
 * `Groups.tsx`; they were previously discarded with a 201, which is why the swagger
 * model names them explicitly now.
 */
export interface CreateGroupData {
  name: string;
  description?: string;
  member_ids?: number[];
  default_split_method?: string;
  auto_include_all?: boolean;
  default_split_values?: Record<string, number>;
}

export interface GroupsResponse {
  groups: Group[];
}

/**
 * One line of a group's settlement: who pays whom, and how much.
 *
 * *** `from_id`/`to_id` ARE WHY THIS IS USABLE AT ALL. *** The endpoint used to
 * return `from`/`to` as display NAMES only, and `Groups.tsx` recorded that as
 * the reason it could not total "you owe" across groups — two members can share
 * a name, so matching on one attributes a debt to the wrong person. The ids
 * were added server-side (they were already in scope in
 * `calculate_group_balances`); the names stay for rendering.
 */
export interface GroupBalance {
  from: string;
  to: string;
  /** Present on any server new enough to send it; absent on an older deployment. */
  from_id?: string;
  to_id?: string;
  amount: number;
}

export const groupsApi = {
  /** Who owes whom in one group, already netted by the server. */
  balances: async (id: number): Promise<GroupBalance[]> => {
    const response = await api.get<{ balances: GroupBalance[] }>(
      `/api/v1/groups/${id}/balances`);
    return response.data.balances || [];
  },

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
  create: async (data: CreateGroupData): Promise<{ message: string; group_id: number }> => {
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
