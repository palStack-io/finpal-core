/**
 * Team Types
 * Types for team collaboration and invitations
 */

/* 'viewer' was removed 2026-09-08 (owner decision B7): it was offered in the invite
   form, stored on the invitation, and did nothing — `User` carries only `is_admin`,
   so a "viewer" was an ordinary member with full write access wearing a badge that
   said otherwise. `StoredRole` keeps it for rendering rows that already hold it. */
export type TeamRole = 'owner' | 'admin' | 'member';
export type StoredRole = TeamRole | 'viewer';

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
  /* From the server, so `StoredRole`: `/team/members` derives this as
     `'owner' if is_admin else 'member'` today, but a type that cannot express what
     the server may send is a type that stops describing it. */
  role: StoredRole;
  joinedAt: string;
  lastActive?: string;
  avatar?: string;
}

export interface Invitation {
  id: number;
  email: string;
  /* From the server, and invitations sent before B7 still hold 'viewer'. */
  role: StoredRole;
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
