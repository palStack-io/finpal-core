/**
 * Team Management Component
 * Team collaboration with invitations and member management
 *
 * Inline styles with CSS variables (the house pattern — see
 * components/settings/ImportSources.tsx). It previously used Tailwind, whose config
 * hardcodes `background.dark` with no `data-theme` awareness, so this panel rendered
 * as a dark card on a light page and could not follow the theme toggle.
 */

import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { teamService } from '../../services/teamService';
import { useToast } from '../../contexts/ToastContext';
import {
  UserPlus,
  Users,
  Mail,
  Trash2,
  Crown,
  Shield,
  Eye,
  RefreshCw,
  Send,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { TeamMember, Invitation, TeamRole } from '../../types/team';
import { apiErrorMessage } from '../../utils/apiError';

/** Semantic accent colours; deliberately not variablised — see CLAUDE.md. */
const GREEN = '#22c55e';
const RED = '#ef4444';
const BLUE = '#3b82f6';
const AMBER = '#f59e0b';

const stackStyle = (gap: string): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap,
});

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: 'var(--text-primary)',
  fontSize: '20px',
  fontWeight: '700',
  margin: 0,
};

/** Inset panel on top of a Card, matching ImportSources' panelStyle. */
const panelStyle: React.CSSProperties = {
  padding: '16px',
  background: 'var(--surface-hover)',
  border: '1px solid var(--border-light)',
  borderRadius: '12px',
};

const rowStyle: React.CSSProperties = {
  ...panelStyle,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontWeight: '500',
  marginBottom: '8px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: '12px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const focusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'var(--brand-main-green)';
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'var(--input-border)';
  },
};

const badgeStyle = (background: string, color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  borderRadius: '6px',
  fontSize: '12px',
  background,
  color,
});

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap',
  fontSize: '14px',
  color: 'var(--text-secondary)',
};

const spinnerWrapStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '32px 0',
};

/** `.animate-spin` is hand-defined in src/index.css, not Tailwind. */
const spinnerStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  borderBottom: '2px solid var(--brand-main-green)',
  margin: '0 auto',
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '32px 0',
  color: 'var(--text-muted)',
};

/**
 * Destructive outline button. common/Button sets `style` before spreading props, so
 * a `style` passed in replaces its computed style outright — this has to restate the
 * whole box (Button's `sm` size + `outline` variant) rather than just the colours.
 */
const dangerButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '6px 12px',
  fontSize: '14px',
  fontWeight: 500,
  borderRadius: '8px',
  background: 'transparent',
  color: RED,
  border: '2px solid rgba(239, 68, 68, 0.3)',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

const dangerHoverHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent';
  },
};

export const TeamManagement: React.FC = () => {
  const { showToast } = useToast();

  // Team members state
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Invitations state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('member');
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  useEffect(() => {
    loadMembers();
    loadInvitations();
  }, []);

  const loadMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const data = await teamService.getMembers();
      setMembers(data);
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Failed to load team members'), 'error');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const loadInvitations = async () => {
    setIsLoadingInvitations(true);
    try {
      const data = await teamService.getInvitations();
      setInvitations(data);
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Failed to load invitations'), 'error');
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) {
      showToast('Please enter an email address', 'error');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      showToast('Please enter a valid email address', 'error');
      return;
    }

    setIsSendingInvite(true);
    try {
      await teamService.inviteUser(inviteEmail, inviteRole);
      showToast('Invitation sent successfully', 'success');
      setInviteEmail('');
      setInviteRole('member');
      loadInvitations();
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Failed to send invitation'), 'error');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleCancelInvitation = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return;

    try {
      await teamService.cancelInvitation(id);
      showToast('Invitation cancelled', 'success');
      loadInvitations();
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Failed to cancel invitation'), 'error');
    }
  };

  const handleResendInvitation = async (id: number) => {
    try {
      await teamService.resendInvitation(id);
      showToast('Invitation resent successfully', 'success');
      loadInvitations();
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Failed to resend invitation'), 'error');
    }
  };

  const handleRemoveMember = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from the team?`)) return;

    try {
      await teamService.removeMember(id);
      showToast('Member removed successfully', 'success');
      loadMembers();
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Failed to remove member'), 'error');
    }
  };

  const handleUpdateRole = async (id: string, newRole: TeamRole) => {
    try {
      await teamService.updateMemberRole(id, newRole);
      showToast('Role updated successfully', 'success');
      loadMembers();
    } catch (error: any) {
      showToast(apiErrorMessage(error, 'Failed to update role'), 'error');
    }
  };

  const getRoleIcon = (role: TeamRole) => {
    switch (role) {
      case 'owner':
        return <Crown size={16} style={{ color: AMBER }} />;
      case 'admin':
        return <Shield size={16} style={{ color: BLUE }} />;
      case 'viewer':
        return <Eye size={16} style={{ color: 'var(--text-muted)' }} />;
      default:
        return <Users size={16} style={{ color: GREEN }} />;
    }
  };

  const getRoleBadgeStyle = (role: TeamRole): React.CSSProperties => {
    switch (role) {
      case 'owner':
        return badgeStyle('rgba(245, 158, 11, 0.1)', AMBER);
      case 'admin':
        return badgeStyle('rgba(59, 130, 246, 0.1)', BLUE);
      case 'viewer':
        return badgeStyle('var(--surface-active)', 'var(--text-muted)');
      default:
        return badgeStyle('rgba(34, 197, 94, 0.1)', GREEN);
    }
  };

  const getStatusBadge = (status: Invitation['status']) => {
    switch (status) {
      case 'accepted':
        return (
          <span style={badgeStyle('rgba(34, 197, 94, 0.1)', GREEN)}>
            <CheckCircle size={12} />
            Accepted
          </span>
        );
      case 'expired':
        return (
          <span style={badgeStyle('rgba(239, 68, 68, 0.1)', RED)}>
            <XCircle size={12} />
            Expired
          </span>
        );
      case 'cancelled':
        return (
          <span style={badgeStyle('var(--surface-active)', 'var(--text-muted)')}>
            <XCircle size={12} />
            Cancelled
          </span>
        );
      default:
        return (
          <span style={badgeStyle('rgba(245, 158, 11, 0.1)', AMBER)}>
            <Clock size={12} />
            Pending
          </span>
        );
    }
  };

  return (
    <div style={stackStyle('24px')}>
      {/* Invite Users Section */}
      <Card>
        <h2 style={{ ...sectionTitleStyle, marginBottom: '24px' }}>
          <UserPlus size={20} />
          Invite Team Member
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
          Invite others to collaborate on your financial management
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <div style={{ flex: '2 1 260px', minWidth: 0 }}>
            <label style={labelStyle} htmlFor="team-invite-email">Email Address</label>
            <input
              id="team-invite-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              style={inputStyle}
              placeholder="colleague@example.com"
              {...focusHandlers}
            />
          </div>
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <label style={labelStyle} htmlFor="team-invite-role">Role</label>
            <select
              id="team-invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamRole)}
              style={inputStyle}
              {...focusHandlers}
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div style={{ ...panelStyle, marginBottom: '16px' }}>
          <p style={{ color: 'var(--text-primary)', fontWeight: '500', marginBottom: '8px' }}>
            Role Permissions:
          </p>
          <div style={{ ...stackStyle('8px'), fontSize: '14px', color: 'var(--text-secondary)' }}>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Viewer:</strong> Can view all data but cannot make
              changes
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Member:</strong> Can add/edit transactions and view
              reports
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Admin:</strong> Full access except transferring
              ownership
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={handleSendInvite}
          isLoading={isSendingInvite}
        >
          <Send size={16} />
          Send Invitation
        </Button>
      </Card>

      {/* Pending Invitations */}
      <Card>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '24px',
        }}>
          <h2 style={sectionTitleStyle}>
            <Mail size={20} />
            Pending Invitations
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={loadInvitations}
            disabled={isLoadingInvitations}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>

        {isLoadingInvitations ? (
          <div style={spinnerWrapStyle}>
            <div className="animate-spin" style={spinnerStyle}></div>
          </div>
        ) : invitations.length > 0 ? (
          <div style={stackStyle('12px')}>
            {invitations.map((invitation) => (
              <div key={invitation.id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginBottom: '4px',
                  }}>
                    <Mail size={16} style={{ color: 'var(--text-secondary)' }} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: '500', overflowWrap: 'anywhere' }}>
                      {invitation.email}
                    </span>
                    {getStatusBadge(invitation.status)}
                  </div>
                  <div style={metaRowStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {getRoleIcon(invitation.role)}
                      <span style={{ textTransform: 'capitalize' }}>{invitation.role}</span>
                    </span>
                    <span>Sent: {new Date(invitation.sentAt).toLocaleDateString()}</span>
                    <span>Expires: {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {invitation.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendInvitation(invitation.id)}
                    >
                      <RefreshCw size={12} />
                      Resend
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelInvitation(invitation.id)}
                      style={dangerButtonStyle}
                      {...dangerHoverHandlers}
                    >
                      <Trash2 size={12} />
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={emptyStateStyle}>No pending invitations</div>
        )}
      </Card>

      {/* Team Members */}
      <Card>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '24px',
        }}>
          <h2 style={sectionTitleStyle}>
            <Users size={20} />
            Team Members
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMembers}
            disabled={isLoadingMembers}
          >
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>

        {isLoadingMembers ? (
          <div style={spinnerWrapStyle}>
            <div className="animate-spin" style={spinnerStyle}></div>
          </div>
        ) : members.length > 0 ? (
          <div style={stackStyle('12px')}>
            {members.map((member) => (
              <div key={member.id} style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'var(--surface-active)',
                    border: '2px solid var(--border-light)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {member.avatar ? (
                      <img
                        src={member.avatar}
                        alt={member.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Users size={24} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      marginBottom: '4px',
                    }}>
                      <h3 style={{
                        color: 'var(--text-primary)',
                        fontSize: '16px',
                        fontWeight: '600',
                        margin: 0,
                      }}>
                        {member.name}
                      </h3>
                      <span style={{ ...getRoleBadgeStyle(member.role), padding: '2px 8px' }}>
                        {getRoleIcon(member.role)}
                        <span style={{ textTransform: 'capitalize' }}>{member.role}</span>
                      </span>
                    </div>
                    <p style={{
                      color: 'var(--text-secondary)',
                      fontSize: '14px',
                      margin: 0,
                      overflowWrap: 'anywhere',
                    }}>
                      {member.email}
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      flexWrap: 'wrap',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginTop: '4px',
                    }}>
                      <span>Joined: {new Date(member.joinedAt).toLocaleDateString()}</span>
                      {member.lastActive && (
                        <span>Last active: {new Date(member.lastActive).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                {member.role !== 'owner' && (
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value as TeamRole)}
                      style={{
                        ...inputStyle,
                        width: 'auto',
                        padding: '8px 12px',
                        borderRadius: '8px',
                      }}
                      {...focusHandlers}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveMember(member.id, member.name)}
                      style={dangerButtonStyle}
                      {...dangerHoverHandlers}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={emptyStateStyle}>No team members</div>
        )}
      </Card>

      {/* Transfer Ownership (Future) */}
      <Card>
        <h2 style={{ ...sectionTitleStyle, marginBottom: '24px' }}>
          <Crown size={20} />
          Transfer Ownership
        </h2>
        <p className="fp-hint-block">
          Transfer account ownership to another team member (This action cannot be undone)
        </p>
        <div style={{ ...panelStyle, padding: '24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Only the account owner can transfer ownership to another admin
          </p>
          <span style={{
            display: 'inline-block',
            marginTop: '8px',
            padding: '4px 12px',
            background: 'rgba(245, 158, 11, 0.1)',
            color: AMBER,
            fontSize: '14px',
            borderRadius: '6px',
          }}>
            Admin Only
          </span>
        </div>
      </Card>
    </div>
  );
};
