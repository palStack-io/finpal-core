import React, { useState, useEffect } from 'react';
import { Search, Plus, ArrowUpRight, ArrowDownRight, Calendar, Edit, Trash2, Loader2 } from 'lucide-react';
import { transactionsApi, Transaction } from '../services/api/transactions';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';
import { StatCard } from '../components/StatCard';
import { SectionCard } from '../components/SectionCard';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';

const metaTextStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '12px' };

export const Transactions: React.FC = () => {
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [netBalance, setNetBalance] = useState(0);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const data = await transactionsApi.getAll();
      setTransactions(data.transactions);
      setTotalIncome(data.summary.total_income);
      setTotalExpense(data.summary.total_expense);
      setNetBalance(data.summary.net_balance);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleTransactionSuccess = () => {
    setIsAddPanelOpen(false);
    setIsEditPanelOpen(false);
    setSelectedTransaction(null);
    fetchTransactions();
  };

  const handleEditClick = (e: React.MouseEvent, transaction: Transaction) => {
    e.stopPropagation();
    setSelectedTransaction(transaction);
    setIsEditPanelOpen(true);
  };

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsEditPanelOpen(true);
  };

  const handleDeleteClick = async (e: React.MouseEvent, transactionId: number) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await transactionsApi.delete(transactionId);
        fetchTransactions();
      } catch (err: any) {
        alert(err.response?.data?.error || 'Failed to delete transaction');
      }
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      (t.description || t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.category?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || t.transaction_type === filterType;
    return matchesSearch && matchesFilter;
  });

  // Group by display date, preserving API sort order
  const groupedTransactions = filteredTransactions.reduce<Record<string, Transaction[]>>((acc, txn) => {
    const key = new Date(txn.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(txn);
    return acc;
  }, {});

  return (
    <>
      <div style={pageContainerStyle}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>Transactions</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Track all your income and expenses</p>
            </div>
            <button
              onClick={() => setIsAddPanelOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                border: '1px solid rgba(21,128,61,0.5)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.3s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(21,128,61,0.3)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <Plus size={20} />
              Add Transaction
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '100px 0' }}>
              <Loader2 size={48} className="animate-spin" style={{ color: 'var(--brand-green-glow)' }} />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div style={{ padding: '24px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', marginBottom: '24px' }}>
              <p style={{ color: 'var(--accent-red)', fontSize: '14px' }}>{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <StatCard
                  label="Total Income"
                  value={`+${formatCurrency(totalIncome)}`}
                  accentColor="#22c55e"
                  icon={<ArrowUpRight size={24} color="#22c55e" />}
                  valueColor="#22c55e"
                />
                <StatCard
                  label="Total Expenses"
                  value={`-${formatCurrency(totalExpense)}`}
                  accentColor="#ef4444"
                  icon={<ArrowDownRight size={24} color="#ef4444" />}
                  valueColor="#ef4444"
                />
                <StatCard
                  label="Net Balance"
                  value={`${netBalance >= 0 ? '+' : ''}${formatCurrency(netBalance)}`}
                  accentColor="#fbbf24"
                  icon={<Calendar size={24} color="#fbbf24" />}
                  valueColor={netBalance >= 0 ? 'var(--brand-green-glow)' : 'var(--accent-red)'}
                />
              </div>

              {/* Search & Filter */}
              <SectionCard title="Filter Transactions">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                  <div style={{ flex: '1', minWidth: '250px', position: 'relative' }}>
                    <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{
                        width: '100%', padding: '12px 12px 12px 44px',
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                        borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px',
                        outline: 'none', transition: 'all 0.3s',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(21,128,61,0.5)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--input-border)'; }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['all', 'income', 'expense'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        style={{
                          padding: '12px 20px',
                          background: filterType === type ? 'linear-gradient(135deg, #15803d 0%, #166534 100%)' : 'var(--surface-hover)',
                          border: `1px solid ${filterType === type ? 'rgba(21,128,61,0.5)' : 'var(--border-light)'}`,
                          borderRadius: '8px',
                          color: filterType === type ? 'white' : 'var(--text-secondary)',
                          fontSize: '14px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.3s',
                        }}
                        onMouseEnter={(e) => { if (filterType !== type) { e.currentTarget.style.background = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                        onMouseLeave={(e) => { if (filterType !== type) { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>

              {/* Transactions grouped by date */}
              <div style={{ marginTop: '24px' }}>
                <SectionCard title={`All Transactions (${filteredTransactions.length})`}>
                  {filteredTransactions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 0' }}>
                      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No transactions found</p>
                    </div>
                  ) : (
                    Object.entries(groupedTransactions).map(([dateLabel, txns]) => (
                      <React.Fragment key={dateLabel}>
                        <div style={{ padding: '12px 0 6px', marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {dateLabel}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '4px' }}>
                          {txns.map((transaction) => (
                            <div
                              key={transaction.id}
                              onClick={() => handleRowClick(transaction)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--surface-hover)', border: '1px solid var(--border-light)', borderRadius: '8px', transition: 'all 0.2s', cursor: 'pointer' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--table-row-hover)'; e.currentTarget.style.borderColor = 'rgba(21,128,61,0.3)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.transform = 'translateX(0)'; }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                <div style={{
                                  width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: transaction.transaction_type === 'income' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                }}>
                                  {transaction.transaction_type === 'income'
                                    ? <ArrowUpRight size={22} color="#22c55e" />
                                    : <ArrowDownRight size={22} color="#ef4444" />}
                                </div>
                                <div>
                                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                                    {transaction.description || transaction.name}
                                  </p>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={metaTextStyle}>{transaction.category?.name || 'Uncategorized'}</span>
                                    {transaction.account?.name && (
                                      <>
                                        <span style={metaTextStyle}>·</span>
                                        <span style={metaTextStyle}>{transaction.account.name}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                                <p style={{
                                  fontSize: '15px', fontWeight: '700',
                                  color: transaction.transaction_type === 'income' ? 'var(--brand-green-glow)'
                                    : transaction.transaction_type === 'transfer' ? 'var(--accent-blue)'
                                    : 'var(--accent-red)',
                                }}>
                                  {transaction.transaction_type === 'income' && '+'}
                                  {transaction.transaction_type === 'expense' && '-'}
                                  {formatCurrency(Math.abs(transaction.amount))}
                                </p>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    onClick={(e) => handleEditClick(e, transaction)}
                                    aria-label="Edit transaction"
                                    style={{ padding: '7px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', color: 'var(--brand-accent-gold)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(251,191,36,0.2)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(251,191,36,0.1)'; e.currentTarget.style.transform = 'scale(1)'; }}
                                  >
                                    <Edit size={15} />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteClick(e, transaction.id)}
                                    aria-label="Delete transaction"
                                    style={{ padding: '7px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: 'var(--accent-red)', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.transform = 'scale(1)'; }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </React.Fragment>
                    ))
                  )}
                </SectionCard>
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', borderTop: '1px solid var(--border-light)', marginTop: '40px' }}>
            Part of {branding.parentBrand} ecosystem
          </div>
        </div>
      </div>

      <SlidePanel isOpen={isAddPanelOpen} onClose={() => setIsAddPanelOpen(false)} title="Add New Transaction">
        <AddTransactionForm onSuccess={handleTransactionSuccess} onCancel={() => setIsAddPanelOpen(false)} />
      </SlidePanel>

      <SlidePanel
        isOpen={isEditPanelOpen}
        onClose={() => { setIsEditPanelOpen(false); setSelectedTransaction(null); }}
        title="Edit Transaction"
      >
        {selectedTransaction && (
          <AddTransactionForm
            transaction={selectedTransaction}
            onSuccess={handleTransactionSuccess}
            onCancel={() => { setIsEditPanelOpen(false); setSelectedTransaction(null); }}
          />
        )}
      </SlidePanel>
    </>
  );
};
