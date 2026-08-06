/**
 * Team Types
 * Types for team collaboration and invitations
 */

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface TeamMember {
  /**
   * The user's ID, which in finPal **is their email address** — `User.id` is a
   * `String(120)` primary key and `/api/v1/team/members` returns `u.id` here.
   *
   * This was declared `number` and never matched what the server sends. Nothing
   * compared it to anything, so the compiler had no reason to complain and the
   * value flowed through to `removeMember`/`updateMemberRole` (whose routes are
   * `<path:member_id>`, so they worked). Corrected because the account owner picker
   * sends this as `owner_id`, where a wrong type would be a real bug.
   */
  id: string;
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
