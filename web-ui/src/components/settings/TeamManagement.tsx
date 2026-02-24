/**
 * Team Management Component
 * Team collaboration with invitations and member management
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
      showToast(error.response?.data?.message || 'Failed to load team members', 'error');
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
      showToast(error.response?.data?.message || 'Failed to load invitations', 'error');
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
      showToast(error.response?.data?.message || 'Failed to send invitation', 'error');
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
      showToast(error.response?.data?.message || 'Failed to cancel invitation', 'error');
    }
  };

  const handleResendInvitation = async (id: number) => {
    try {
      await teamService.resendInvitation(id);
      showToast('Invitation resent successfully', 'success');
      loadInvitations();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to resend invitation', 'error');
    }
  };

  const handleRemoveMember = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from the team?`)) return;

    try {
      await teamService.removeMember(id);
      showToast('Member removed successfully', 'success');
      loadMembers();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to remove member', 'error');
    }
  };

  const handleUpdateRole = async (id: number, newRole: TeamRole) => {
    try {
      await teamService.updateMemberRole(id, newRole);
      showToast('Role updated successfully', 'success');
      loadMembers();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update role', 'error');
    }
  };

  const getRoleIcon = (role: TeamRole) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'admin':
        return <Shield className="w-4 h-4 text-blue-500" />;
      case 'viewer':
        return <Eye className="w-4 h-4 text-gray-400" />;
      default:
        return <Users className="w-4 h-4 text-green-500" />;
    }
  };

  const getRoleBadgeColor = (role: TeamRole) => {
    switch (role) {
      case 'owner':
        return 'bg-yellow-500/10 text-yellow-500';
      case 'admin':
        return 'bg-blue-500/10 text-blue-500';
      case 'viewer':
        return 'bg-gray-500/10 text-gray-400';
      default:
        return 'bg-green-500/10 text-green-500';
    }
  };

  const getStatusBadge = (status: Invitation['status']) => {
    switch (status) {
      case 'accepted':
        return (
          <span className="px-2 py-1 bg-green-500/10 text-green-500 text-xs rounded flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Accepted
          </span>
        );
      case 'expired':
        return (
          <span className="px-2 py-1 bg-red-500/10 text-red-500 text-xs rounded flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Expired
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-1 bg-gray-500/10 text-gray-400 text-xs rounded flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 text-xs rounded flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Invite Users Section */}
      <Card>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Invite Team Member
        </h2>
        <p className="text-gray-400 mb-6">
          Invite others to collaborate on your financial management
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-2">
            <label className="block text-white font-medium mb-2">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
              placeholder="colleague@example.com"
            />
          </div>
          <div>
            <label className="block text-white font-medium mb-2">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamRole)}
              className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="bg-background-darker border border-gray-800 rounded-xl p-4 mb-4">
          <p className="text-white font-medium mb-2">Role Permissions:</p>
          <div className="space-y-2 text-sm text-gray-400">
            <p>
              <strong className="text-white">Viewer:</strong> Can view all data but cannot make
              changes
            </p>
            <p>
              <strong className="text-white">Member:</strong> Can add/edit transactions and view
              reports
            </p>
            <p>
              <strong className="text-white">Admin:</strong> Full access except transferring
              ownership
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={handleSendInvite}
          isLoading={isSendingInvite}
        >
          <Send className="h-4 w-4 mr-2" />
          Send Invitation
        </Button>
      </Card>

      {/* Pending Invitations */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Pending Invitations
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={loadInvitations}
            disabled={isLoadingInvitations}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        {isLoadingInvitations ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : invitations.length > 0 ? (
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="p-4 bg-background-darker border border-gray-800 rounded-xl flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-white font-medium">{invitation.email}</span>
                    {getStatusBadge(invitation.status)}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span className="flex items-center gap-1">
                      {getRoleIcon(invitation.role)}
                      <span className="capitalize">{invitation.role}</span>
                    </span>
                    <span>Sent: {new Date(invitation.sentAt).toLocaleDateString()}</span>
                    <span>Expires: {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {invitation.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendInvitation(invitation.id)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Resend
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelInvitation(invitation.id)}
                      className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No pending invitations</div>
        )}
      </Card>

      {/* Team Members */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={loadMembers}
            disabled={isLoadingMembers}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        {isLoadingMembers ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : members.length > 0 ? (
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.id}
                className="p-4 bg-background-darker border border-gray-800 rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-background-darker border-2 border-gray-800 overflow-hidden flex items-center justify-center">
                    {member.avatar ? (
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="w-6 h-6 text-gray-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-semibold">{member.name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded flex items-center gap-1 ${getRoleBadgeColor(member.role)}`}>
                        {getRoleIcon(member.role)}
                        <span className="capitalize">{member.role}</span>
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm">{member.email}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                      <span>Joined: {new Date(member.joinedAt).toLocaleDateString()}</span>
                      {member.lastActive && (
                        <span>Last active: {new Date(member.lastActive).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                {member.role !== 'owner' && (
                  <div className="flex gap-2">
                    <select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value as TeamRole)}
                      className="px-3 py-2 bg-background-darker border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveMember(member.id, member.name)}
                      className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No team members</div>
        )}
      </Card>

      {/* Transfer Ownership (Future) */}
      <Card>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Crown className="h-5 w-5" />
          Transfer Ownership
        </h2>
        <p className="text-gray-400 mb-4">
          Transfer account ownership to another team member (This action cannot be undone)
        </p>
        <div className="p-6 bg-background-darker border border-gray-800 rounded-xl text-center">
          <p className="text-gray-500">
            Only the account owner can transfer ownership to another admin
          </p>
          <span className="inline-block mt-2 px-3 py-1 bg-yellow-500/10 text-yellow-500 text-sm rounded">
            Admin Only
          </span>
        </div>
      </Card>
    </div>
  );
};
