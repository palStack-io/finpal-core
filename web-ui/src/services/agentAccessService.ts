/**
 * Agent Access Service
 * Personal access tokens, and review of writes an API client proposed.
 */

import { api } from './api';

export type TokenScope = 'read' | 'read_write';

export interface AccessToken {
  id: number;
  name: string;
  token_prefix: string;
  scopes: TokenScope;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string | null;
  revoked_at: string | null;
}

export interface CreatedToken {
  /** Returned exactly once, at creation. */
  token: string;
  token_info: AccessToken;
}

export type AgentActionStatus =
  | 'applied' | 'pending' | 'approved' | 'rejected' | 'expired' | 'reverted';

export interface AgentAction {
  id: number;
  action: string;
  payload: Record<string, unknown>;
  status: AgentActionStatus;
  target_ref: string | null;
  token_id: number | null;
  created_at: string | null;
  decided_at: string | null;
  expires_at: string | null;
  reverted_at: string | null;
}

export const agentAccessService = {
  async listTokens(): Promise<AccessToken[]> {
    const response = await api.get('/api/v1/access-tokens');
    return response.data.tokens;
  },

  /** The plaintext in the result is the only time it is ever available. */
  async createToken(
    name: string, scopes: TokenScope, expiresInDays: number,
  ): Promise<CreatedToken> {
    const response = await api.post('/api/v1/access-tokens', {
      name, scopes, expires_in_days: expiresInDays,
    });
    return response.data;
  },

  /** Resolves to the number of pending proposals rejected alongside it. */
  async revokeToken(id: number): Promise<number> {
    const response = await api.delete(`/api/v1/access-tokens/${id}`);
    return response.data.rejected_pending ?? 0;
  },

  async listActions(status?: AgentActionStatus): Promise<AgentAction[]> {
    const response = await api.get('/api/v1/agent-actions', {
      params: status ? { status } : undefined,
    });
    return response.data.actions;
  },

  async approveAction(id: number): Promise<AgentAction> {
    const response = await api.post(`/api/v1/agent-actions/${id}/approve`);
    return response.data.action;
  },

  async rejectAction(id: number): Promise<AgentAction> {
    const response = await api.post(`/api/v1/agent-actions/${id}/reject`);
    return response.data.action;
  },

  /**
   * Reverse an action that was already applied. The server answers 409 when it
   * has no undo state recorded, which the serializer does not expose — so the
   * caller must surface that error rather than assume every applied row can be
   * reversed.
   */
  async revertAction(id: number): Promise<AgentAction> {
    const response = await api.delete(`/api/v1/agent-actions/${id}`);
    return response.data.action;
  },
};
