/**
 * Team Service
 * Handles team collaboration, invitations, and member management
 */

import { api } from './api';
import type {
  TeamMember,
  Invitation,
  InviteUserRequest,
  TeamRole,
  UpdateMemberRoleRequest,
} from '../types/team';

export const teamService = {
  /**
   * Invite a user to the team
   */
  async inviteUser(email: string, role: TeamRole): Promise<Invitation> {
    const data: InviteUserRequest = { email, role };
    const response = await api.post('/api/v1/team/invite', data);
    return response.data;
  },

  /**
   * Get all pending invitations
   */
  async getInvitations(): Promise<Invitation[]> {
    const response = await api.get('/api/v1/team/invitations');
    return response.data;
  },

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(id: number): Promise<void> {
    await api.delete(`/api/v1/team/invitations/${id}`);
  },

  /**
   * Resend an invitation
   */
  async resendInvitation(id: number): Promise<void> {
    await api.post(`/api/v1/team/invitations/${id}/resend`);
  },

  /**
   * Get all team members
   */
  async getMembers(): Promise<TeamMember[]> {
    const response = await api.get('/api/v1/team/members');
    return response.data;
  },

  /**
   * Remove a member from the team
   */
  async removeMember(id: number): Promise<void> {
    await api.delete(`/api/v1/team/members/${id}`);
  },

  /**
   * Update a member's role
   */
  async updateMemberRole(id: number, role: TeamRole): Promise<void> {
    const data: UpdateMemberRoleRequest = { role };
    await api.put(`/api/v1/team/members/${id}/role`, data);
  },

  /**
   * Transfer ownership to another member
   */
  async transferOwnership(memberId: number): Promise<void> {
    await api.post('/api/v1/team/transfer-ownership', { memberId });
  },

  /**
   * Leave the team
   */
  async leaveTeam(): Promise<void> {
    await api.post('/api/v1/team/leave');
  },

  /**
   * Accept an invitation
   */
  async acceptInvitation(token: string): Promise<void> {
    await api.post('/api/v1/team/accept-invitation', { token });
  },
};

export default teamService;
