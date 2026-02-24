/**
 * Team Types
 * Types for team collaboration and invitations
 */

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
  lastActive?: string;
  avatar?: string;
}

export interface Invitation {
  id: number;
  email: string;
  role: TeamRole;
  sentAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  invitedBy?: string;
}

export interface InviteUserRequest {
  email: string;
  role: TeamRole;
}

export interface UpdateMemberRoleRequest {
  role: TeamRole;
}
