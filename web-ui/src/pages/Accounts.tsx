import React, { useState, useEffect } from 'react';
import { Plus, Wallet, CreditCard, PiggyBank, TrendingUp, TrendingDown, Edit2, Trash2, RefreshCw, Eye, EyeOff, MoreVertical, DollarSign, Upload } from 'lucide-react';
import { accountService } from '../services/accountService';
import { useToast } from '../contexts/ToastContext';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { SlidePanel } from '../components/SlidePanel';
import { AddAccountForm } from '../components/forms/AddAccountForm';
import { EditAccountForm } from '../components/forms/EditAccountForm';
import { CSVImportModal } from '../components/import/CSVImportModal';

export const Accounts = () => {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');
  const [showBalances, setShowBalances] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await accountService.getAccounts();

      // Format accounts data with additional fields
      const formattedAccounts = (data || []).map((acc: any) => ({
        id: acc.id,
        name: acc.name,
        type: acc.account_type || 'checking',
        balance: acc.balance || 0,
        currency: acc.currency_code || 'USD',
        lastSync: acc.last_sync ? new Date(acc.last_sync).toLocaleDateString() : 'Never',
        trend: { value: 2.3, direction: 'up' }, // TODO: Calculate from historical data
        institution: acc.institution || 'Manual',
        accountNumber: acc.account_number || 'N/A',
        color: acc.color || getAccountColor(acc.account_type || 'checking'),
        creditLimit: acc.credit_limit || null,
        availableCredit: acc.credit_limit ? acc.credit_limit - Math.abs(acc.balance || 0) : null
      }));

      setAccounts(formattedAccounts);
    } catch (error: any) {
      console.error('Failed to load accounts:', error);
      showToast('Failed to load accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getAccountColor = (type: string) => {
    switch(type) {
      case 'checking': return '#3b82f6';
      case 'savings': return '#22c55e';
      case 'credit': return '#ef4444';
      case 'investment': return '#8b5cf6';
      case 'cash': return '#f59e0b';
      default: return '#3b82f6';
    }
  };

  const getAccountIcon = (type: string) => {
    switch(type) {
      case 'checking': return <Wallet size={24} />;
      case 'savings': return <PiggyBank size={24} />;
      case 'credit': return <CreditCard size={24} />;
      case 'investment': return <TrendingUp size={24} />;
      case 'cash': return <DollarSign size={24} />;
      default: return <Wallet size={24} />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(amount));
  };

  const handleDeleteAccount = async (accountId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this account?')) return;

    try {
      await accountService.deleteAccount(accountId);
      showToast('Account deleted successfully', 'success');
      loadAccounts();
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      showToast('Failed to delete account', 'error');
    }
  };

  const handleSyncAll = async () => {
    try {
      showToast('Syncing accounts...', 'info');
      // TODO: Implement sync functionality
      await loadAccounts();
      showToast('Accounts synced successfully', 'success');
    } catch (error: any) {
      console.error('Failed to sync accounts:', error);
      showToast('Failed to sync accounts', 'error');
    }
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalAssets = accounts.filter(a => a.balance > 0).reduce((sum, acc) => sum + acc.balance, 0);
  const totalLiabilities = Math.abs(accounts.filter(a => a.balance < 0).reduce((sum, acc) => sum + acc.balance, 0));

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: `linear-gradient(to bottom, var(--bg-primary), var(--bg-secondary))`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '18px' }}>Loading accounts...</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ minHeight: '100vh', padding: '24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                Accounts
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Manage all your financial accounts in one place</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowCSVImport(true)}
                style={{ padding: '10px 16px', background: 'var(--border-light)', border: '1px solid var(--border-medium)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--border-light)'}
              >
                <Upload size={16} />
                Import CSV
              </button>
              <button
                onClick={handleSyncAll}
                style={{ padding: '10px 16px', background: 'var(--border-light)', border: '1px solid var(--border-medium)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--border-light)'}
              >
                <RefreshCw size={16} /> Sync All
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                style={{ padding: '10px 20px', background: '#15803d', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#166534'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#15803d'}
              >
                <Plus size={16} /> Add Account
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>Net Worth</p>
                <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {showBalances ? formatCurrency(totalBalance) : '••••••'}
                </h3>
              </div>
              <div style={{ width: '48px', height: '48px', background: 'rgba(34, 197, 94, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={24} color="#22c55e" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} color="#22c55e" />
              <span style={{ color: '#22c55e', fontSize: '14px' }}>Assets - Liabilities</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>Total Assets</p>
                <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {showBalances ? formatCurrency(totalAssets) : '••••••'}
                </h3>
              </div>
              <div style={{ width: '48px', height: '48px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={24} color="#3b82f6" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{accounts.filter(a => a.balance > 0).length} accounts</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>Total Liabilities</p>
                <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {showBalances ? formatCurrency(totalLiabilities) : '••••••'}
                </h3>
              </div>
              <div style={{ width: '48px', height: '48px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={24} color="#ef4444" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{accounts.filter(a => a.balance < 0).length} accounts</span>
            </div>
          </div>
        </div>

        {/* Accounts List */}
        <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>All Accounts</h2>

          {accounts.length > 0 ? (
            <div style={{ display: 'grid', gap: '16px' }}>
              {accounts.map((account) => (
                <div
                  key={account.id}
                  style={{
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '12px',
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.3s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--border-light)';
                    e.currentTarget.style.borderColor = account.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--surface-hover)';
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                  }}
                  onClick={() => {
                    setEditingAccount(account);
                    setShowEditModal(true);
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                      <div style={{ width: '56px', height: '56px', background: `${account.color}20`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: account.color }}>
                        {getAccountIcon(account.type)}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{account.name}</h3>
                          <span style={{
                            padding: '2px 8px',
                            background: 'var(--border-light)',
                            borderRadius: '6px',
                            fontSize: '11px',
                            color: 'var(--text-secondary)',
                            textTransform: 'capitalize'
                          }}>
                            {account.type}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                            {account.institution} • {account.accountNumber}
                          </p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
                            Last synced: {account.lastSync}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                      {/* Credit Card Specific Info */}
                      {account.type === 'credit' && account.creditLimit && (
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px' }}>Available Credit</p>
                          <p style={{ color: '#22c55e', fontSize: '16px', fontWeight: '600' }}>
                            {showBalances ? formatCurrency(account.availableCredit) : '••••••'}
                          </p>
                        </div>
                      )}

                      {/* Balance */}
                      <div style={{ textAlign: 'right', minWidth: '150px' }}>
                        <p style={{ fontSize: '24px', fontWeight: '700', color: account.balance < 0 ? '#ef4444' : 'var(--text-primary)', marginBottom: '4px' }}>
                          {showBalances ? (
                            <>
                              {account.balance < 0 && '-'}{formatCurrency(account.balance)}
                            </>
                          ) : '••••••'}
                        </p>
                        {account.trend.direction !== 'neutral' && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            {account.trend.direction === 'up' ? (
                              <TrendingUp size={14} color="#22c55e" />
                            ) : (
                              <TrendingDown size={14} color="#ef4444" />
                            )}
                            <span style={{
                              color: account.trend.direction === 'up' ? '#22c55e' : '#ef4444',
                              fontSize: '13px',
                              fontWeight: '500'
                            }}>
                              {account.trend.value}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingAccount(account);
                            setShowEditModal(true);
                          }}
                          style={{
                            padding: '8px',
                            background: 'var(--border-light)',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.3s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-medium)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--border-light)'}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteAccount(account.id, e)}
                          style={{
                            padding: '8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.3s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
              <Wallet size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p style={{ fontSize: '18px', marginBottom: '8px' }}>No accounts yet</p>
              <p style={{ fontSize: '14px' }}>Add your first account to start tracking your finances</p>
            </div>
          )}
        </div>

        {/* Add Account Slide Panel */}
        <SlidePanel
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Add New Account"
        >
          <AddAccountForm
            onSuccess={() => {
              setShowAddModal(false);
              loadAccounts(); // Refresh accounts list
            }}
            onCancel={() => setShowAddModal(false)}
          />
        </SlidePanel>

        {/* Edit Account Slide Panel */}
        {editingAccount && (
          <SlidePanel
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setEditingAccount(null);
            }}
            title="Edit Account"
          >
            <EditAccountForm
              account={editingAccount}
              onSuccess={() => {
                setShowEditModal(false);
                setEditingAccount(null);
                loadAccounts(); // Refresh accounts list
              }}
              onCancel={() => {
                setShowEditModal(false);
                setEditingAccount(null);
              }}
            />
          </SlidePanel>
        )}

        {/* CSV Import Modal */}
        <CSVImportModal
          isOpen={showCSVImport}
          onClose={() => setShowCSVImport(false)}
          onSuccess={() => {
            setShowCSVImport(false);
            showToast('CSV imported successfully!', 'success');
            loadAccounts(); // Refresh accounts after import
          }}
          accounts={accounts}
        />

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', borderTop: '1px solid var(--border-light)', marginTop: '40px' }}>
            Part of {branding.parentBrand} ecosystem
          </div>
      </div>
      </div>
    </>
  );
};

export default Accounts;
