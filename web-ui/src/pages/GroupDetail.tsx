import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, DollarSign, TrendingUp, TrendingDown, CheckCircle, Settings, UserPlus, Receipt, X, Trash2 } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { useToast } from '../contexts/ToastContext';
import { api } from '../services/api';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';
import { Transaction } from '../services/api/transactions';

interface Member {
  id: string;
  name: string;
  email: string;
  balance: number; // positive = they owe, negative = they're owed
}

interface Balance {
  from: string;
  to: string;
  amount: number;
}

interface GroupData {
  id: number;
  name: string;
  description: string;
  created_by: string;
  members: Member[];
}

export const GroupDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [selectedBalance, setSelectedBalance] = useState<Balance | null>(null);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [defaultSplitMethod, setDefaultSplitMethod] = useState('equal');
  const [customSplitValues, setCustomSplitValues] = useState<{ [email: string]: string }>({});
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    loadGroupData();
  }, [id]);

  const loadGroupData = async () => {
    try {
      setLoading(true);

      // Load group details
      const groupRes = await api.get(`/api/v1/groups/${id}`);
      setGroup(groupRes.data.group);
      setGroupName(groupRes.data.group.name);
      setGroupDescription(groupRes.data.group.description);
      setDefaultSplitMethod(groupRes.data.group.default_split_method || 'equal');

      // Load group balances
      const balancesRes = await api.get(`/api/v1/groups/${id}/balances`);
      setBalances(balancesRes.data.balances || []);

      // Load group transactions (using transactions API filtered by group)
      const transactionsRes = await api.get(`/api/v1/transactions/?group_id=${id}`);
      setTransactions(transactionsRes.data.transactions || []);

    } catch (error: any) {
      console.error('Failed to load group data:', error);
      showToast('Failed to load group data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSettle = async (balance: Balance) => {
    setSelectedBalance(balance);
    setShowSettleModal(true);
  };

  const confirmSettle = async () => {
    if (!selectedBalance) return;

    try {
      // Record a settlement as a payment transaction in the group
      await api.post('/api/v1/transactions/', {
        description: `Settlement: ${selectedBalance.from} paid ${selectedBalance.to}`,
        amount: selectedBalance.amount,
        date: new Date().toISOString(),
        transaction_type: 'expense',
        group_id: parseInt(id || '0'),
        paid_by: selectedBalance.from,
        split_method: 'custom',
        splits: {
          [selectedBalance.to]: selectedBalance.amount
        }
      });

      showToast('Settlement recorded successfully', 'success');
      setShowSettleModal(false);
      setSelectedBalance(null);
      loadGroupData(); // Refresh data
    } catch (error: any) {
      console.error('Failed to record settlement:', error);
      showToast(error.response?.data?.error || 'Failed to record settlement', 'error');
    }
  };

  const handleAddMember = async () => {
    if (!newMemberEmail.trim()) {
      showToast('Please enter an email address', 'error');
      return;
    }

    try {
      await api.post(`/api/v1/groups/${id}/members`, {
        email: newMemberEmail.trim()
      });

      showToast('Member added successfully', 'success');
      setShowAddMemberModal(false);
      setNewMemberEmail('');
      loadGroupData(); // Refresh data
    } catch (error: any) {
      console.error('Failed to add member:', error);
      showToast(error.response?.data?.error || 'Failed to add member', 'error');
    }
  };

  const handleUpdateGroup = async () => {
    if (!groupName.trim()) {
      showToast('Group name is required', 'error');
      return;
    }

    // Validate percentage splits if percentage method is selected
    if (defaultSplitMethod === 'percentage' && group?.members) {
      const totalPercentage = group.members.reduce((sum, member) => {
        const value = parseFloat(customSplitValues[member.email] || '0');
        return sum + value;
      }, 0);

      if (totalPercentage > 0 && Math.abs(totalPercentage - 100) > 0.01) {
        showToast('Percentage splits must add up to 100%', 'error');
        return;
      }
    }

    try {
      // Build default_split_values based on split method
      let defaultSplitValues = undefined;
      if (defaultSplitMethod !== 'equal' && group?.members) {
        const hasValues = Object.keys(customSplitValues).some(email =>
          customSplitValues[email] && parseFloat(customSplitValues[email]) > 0
        );

        if (hasValues) {
          defaultSplitValues = {};
          group.members.forEach(member => {
            if (customSplitValues[member.email] && parseFloat(customSplitValues[member.email]) > 0) {
              defaultSplitValues[member.email] = parseFloat(customSplitValues[member.email]);
            }
          });
        }
      }

      await api.put(`/api/v1/groups/${id}`, {
        name: groupName.trim(),
        description: groupDescription.trim(),
        default_split_method: defaultSplitMethod,
        default_split_values: defaultSplitValues
      });

      showToast('Group updated successfully', 'success');
      setShowSettingsModal(false);
      loadGroupData(); // Refresh data
    } catch (error: any) {
      console.error('Failed to update group:', error);
      showToast(error.response?.data?.error || 'Failed to update group', 'error');
    }
  };

  const handleTransactionSuccess = () => {
    setEditingTransaction(null);
    loadGroupData(); // Refresh data
  };

  const handleCloseTransactionPanel = () => {
    setEditingTransaction(null);
  };

  if (loading) {
    return (
      <>
        <Navigation />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'white', fontSize: '18px' }}>Loading...</div>
        </div>
      </>
    );
  }

  if (!group) {
    return (
      <>
        <Navigation />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
          <div style={{ color: 'white', fontSize: '18px' }}>Group not found</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <button
              onClick={() => navigate('/groups')}
              style={{
                padding: '8px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
                fontSize: '14px'
              }}
            >
              <ArrowLeft size={16} /> Back to Groups
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                  {group.name}
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>{group.description || 'No description'}</p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowAddMemberModal(true)}
                  style={{
                    padding: '10px 20px',
                    background: 'rgba(21, 128, 61, 0.2)',
                    border: '1px solid rgba(21, 128, 61, 0.3)',
                    borderRadius: '8px',
                    color: '#86efac',
                    cursor: 'pointer',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px'
                  }}
                >
                  <UserPlus size={16} /> Add Member
                </button>
                <button
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    padding: '10px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

            {/* Members Card */}
            <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '12px' }}>
                  <Users size={24} color="#3b82f6" />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>
                    Members
                  </h2>
                  <p style={{ fontSize: '14px', color: '#94a3b8' }}>{group.members?.length || 0} members</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {group.members?.map((member) => (
                  <div
                    key={member.id}
                    style={{
                      padding: '16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ color: 'white', fontWeight: '500', marginBottom: '4px' }}>{member.name || member.email}</div>
                      <div style={{ fontSize: '13px', color: '#94a3b8' }}>{member.email}</div>
                    </div>
                    {member.balance !== 0 && (
                      <div style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: member.balance > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                        border: `1px solid ${member.balance > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
                        color: member.balance > 0 ? '#ef4444' : '#22c55e',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}>
                        {member.balance > 0 ? '+' : ''}{branding.currencySymbol}{Math.abs(member.balance).toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Balances Card */}
            <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.2)', borderRadius: '12px' }}>
                  <DollarSign size={24} color="#22c55e" />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>
                    Balances
                  </h2>
                  <p style={{ fontSize: '14px', color: '#94a3b8' }}>Who owes whom</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {balances.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                    <CheckCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                    <p>All settled up!</p>
                  </div>
                ) : (
                  balances.map((balance, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'white', fontSize: '14px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600' }}>{balance.from}</span>
                          {' owes '}
                          <span style={{ fontWeight: '600' }}>{balance.to}</span>
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: '600', color: '#22c55e' }}>
                          {branding.currencySymbol}{balance.amount.toFixed(2)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSettle(balance)}
                        style={{
                          padding: '8px 16px',
                          background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                          border: 'none',
                          borderRadius: '8px',
                          color: 'white',
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <CheckCircle size={14} /> Settle
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '12px' }}>
                <Receipt size={24} color="#f59e0b" />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'white' }}>
                Recent Transactions
              </h2>
            </div>

            {transactions.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                No transactions yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {transactions.slice(0, 10).map((transaction) => (
                  <div
                    key={transaction.id}
                    onClick={() => setEditingTransaction(transaction)}
                    style={{
                      padding: '16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'white', fontWeight: '500', marginBottom: '4px' }}>
                        {transaction.description}
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                        {transaction.paid_by && `Paid by ${transaction.paid_by} • `}{new Date(transaction.date).toLocaleDateString()}
                        {transaction.category && typeof transaction.category === 'object' && transaction.category.name && ` • ${transaction.category.name}`}
                      </div>
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: 'white' }}>
                      {branding.currencySymbol}{transaction.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Settle Modal */}
          {showSettleModal && selectedBalance && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}
              onClick={() => setShowSettleModal(false)}
            >
              <div
                style={{
                  background: '#1e293b',
                  borderRadius: '16px',
                  padding: '32px',
                  maxWidth: '500px',
                  width: '90%',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '16px' }}>
                  Record Settlement
                </h2>
                <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
                  Confirm that <strong>{selectedBalance.from}</strong> has paid <strong>{selectedBalance.to}</strong>{' '}
                  <strong>{branding.currencySymbol}{selectedBalance.amount.toFixed(2)}</strong>
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setShowSettleModal(false)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      confirmSettle();
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Confirm Settlement
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add Member Modal */}
          {showAddMemberModal && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}
              onClick={() => setShowAddMemberModal(false)}
            >
              <div
                style={{
                  background: '#1e293b',
                  borderRadius: '16px',
                  padding: '32px',
                  maxWidth: '500px',
                  width: '90%',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '16px' }}>
                  Add Member
                </h2>
                <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
                  Enter the email address of the user you want to add to this group.
                </p>
                <input
                  type="email"
                  placeholder="Email address"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    marginBottom: '24px',
                    outline: 'none'
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddMember();
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => {
                      setShowAddMemberModal(false);
                      setNewMemberEmail('');
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddMember}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Add Member
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Settings Modal */}
          {showSettingsModal && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}
              onClick={() => setShowSettingsModal(false)}
            >
              <div
                style={{
                  background: '#1e293b',
                  borderRadius: '16px',
                  padding: '32px',
                  maxWidth: '500px',
                  width: '90%',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '16px' }}>
                  Group Settings
                </h2>
                <p style={{ color: '#94a3b8', marginBottom: '24px' }}>
                  Update the group name and description.
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>
                    Group Name
                  </label>
                  <input
                    type="text"
                    placeholder="Group name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>
                    Description
                  </label>
                  <textarea
                    placeholder="Group description"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>
                    Default Split Method
                  </label>
                  <select
                    value={defaultSplitMethod}
                    onChange={(e) => setDefaultSplitMethod(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="equal" style={{ background: '#1e293b' }}>Equal Split</option>
                    <option value="percentage" style={{ background: '#1e293b' }}>Percentage Split</option>
                    <option value="custom" style={{ background: '#1e293b' }}>Custom Split</option>
                  </select>
                  <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
                    This will be the default method for splitting expenses in this group
                  </p>

                  {/* Custom Split Values */}
                  {defaultSplitMethod === 'custom' && group?.members && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                      <p style={{ color: '#93c5fd', fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
                        💡 Specify default custom amounts for each member
                      </p>
                      {group.members.map((member) => (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '13px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {member.name || member.email}
                          </span>
                          <input
                            type="number"
                            placeholder="Amount"
                            step="0.01"
                            min="0"
                            value={customSplitValues[member.email] || ''}
                            onChange={(e) => setCustomSplitValues(prev => ({ ...prev, [member.email]: e.target.value }))}
                            style={{
                              width: '120px',
                              padding: '8px 12px',
                              background: 'rgba(0, 0, 0, 0.3)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '6px',
                              color: 'white',
                              fontSize: '13px',
                              outline: 'none'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Percentage Split Values */}
                  {defaultSplitMethod === 'percentage' && group?.members && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '8px' }}>
                      <p style={{ color: '#c4b5fd', fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
                        💡 Specify default percentage split for each member
                      </p>
                      {group.members.map((member) => (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '13px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {member.name || member.email}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              placeholder="50"
                              step="0.1"
                              min="0"
                              max="100"
                              value={customSplitValues[member.email] || ''}
                              onChange={(e) => setCustomSplitValues(prev => ({ ...prev, [member.email]: e.target.value }))}
                              style={{
                                width: '80px',
                                padding: '8px 12px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '13px',
                                outline: 'none'
                              }}
                            />
                            <span style={{ color: '#94a3b8', fontSize: '13px' }}>%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Shares Split Values */}
                  {defaultSplitMethod === 'shares' && group?.members && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: '8px' }}>
                      <p style={{ color: '#fde047', fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
                        💡 Specify default shares for each member
                      </p>
                      {group.members.map((member) => (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '13px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {member.name || member.email}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              placeholder="1"
                              step="1"
                              min="0"
                              value={customSplitValues[member.email] || ''}
                              onChange={(e) => setCustomSplitValues(prev => ({ ...prev, [member.email]: e.target.value }))}
                              style={{
                                width: '80px',
                                padding: '8px 12px',
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '13px',
                                outline: 'none'
                              }}
                            />
                            <span style={{ color: '#94a3b8', fontSize: '13px' }}>shares</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUpdateGroup();
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Transaction Panel */}
          <SlidePanel
            isOpen={!!editingTransaction}
            onClose={handleCloseTransactionPanel}
            title="Edit Transaction"
          >
            <AddTransactionForm
              transaction={editingTransaction || undefined}
              onSuccess={handleTransactionSuccess}
              onCancel={handleCloseTransactionPanel}
            />
          </SlidePanel>
        </div>
      </div>
    </>
  );
};

export default GroupDetail;
