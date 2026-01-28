import React, { useState, useEffect } from 'react';
import { Navigation } from '../components/Navigation';
import { Search, Plus, ArrowUpRight, ArrowDownRight, Filter, Calendar, Edit, Trash2, Loader } from 'lucide-react';
import { transactionsApi, Transaction } from '../services/api/transactions';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';

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

  // Fetch transactions from API
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
      console.error('Error fetching transactions:', err);
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
    fetchTransactions(); // Refresh the transactions list
  };

  const handleEditClick = (e: React.MouseEvent, transaction: Transaction) => {
    e.stopPropagation(); // Prevent row click
    setSelectedTransaction(transaction);
    setIsEditPanelOpen(true);
  };

  const handleRowClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsEditPanelOpen(true);
  };

  const handleDeleteClick = async (e: React.MouseEvent, transactionId: number) => {
    e.stopPropagation(); // Prevent row click
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await transactionsApi.delete(transactionId);
        fetchTransactions(); // Refresh the list
      } catch (err: any) {
        console.error('Error deleting transaction:', err);
        alert(err.response?.data?.error || 'Failed to delete transaction');
      }
    }
  };

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch = (transaction.description || transaction.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (transaction.category?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || transaction.transaction_type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <>
      <Navigation />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                Transactions
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Track all your income and expenses</p>
            </div>
            <button
              onClick={() => setIsAddPanelOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                border: '1px solid rgba(21, 128, 61, 0.5)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(21, 128, 61, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Plus size={20} />
              Add Transaction
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '100px 0' }}>
              <Loader size={48} style={{ color: '#86efac', animation: 'spin 1s linear infinite' }} />
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div style={{ padding: '24px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', marginBottom: '24px' }}>
              <p style={{ color: '#ef4444', fontSize: '14px' }}>{error}</p>
            </div>
          )}

          {/* Summary Cards */}
          {!loading && !error && (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            {/* Total Income */}
            <div
              style={{
                background: 'rgba(17, 24, 39, 0.6)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(134, 239, 172, 0.2)',
                borderRadius: '12px',
                padding: '24px',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(134, 239, 172, 0.5)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(21, 128, 61, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(134, 239, 172, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: '500' }}>Total Income</span>
                <div style={{ background: 'rgba(134, 239, 172, 0.2)', padding: '8px', borderRadius: '8px' }}>
                  <ArrowUpRight size={20} style={{ color: '#86efac' }} />
                </div>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#86efac' }}>
                +${totalIncome.toFixed(2)}
              </p>
            </div>

            {/* Total Expenses */}
            <div
              style={{
                background: 'rgba(17, 24, 39, 0.6)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '12px',
                padding: '24px',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(239, 68, 68, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: '500' }}>Total Expenses</span>
                <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px' }}>
                  <ArrowDownRight size={20} style={{ color: '#ef4444' }} />
                </div>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>
                -${totalExpense.toFixed(2)}
              </p>
            </div>

            {/* Net Balance */}
            <div
              style={{
                background: 'rgba(17, 24, 39, 0.6)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(251, 191, 36, 0.2)',
                borderRadius: '12px',
                padding: '24px',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.5)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(251, 191, 36, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: '500' }}>Net Balance</span>
                <div style={{ background: 'rgba(251, 191, 36, 0.2)', padding: '8px', borderRadius: '8px' }}>
                  <Calendar size={20} style={{ color: '#fbbf24' }} />
                </div>
              </div>
              <p style={{ fontSize: '28px', fontWeight: 'bold', color: netBalance >= 0 ? '#86efac' : '#ef4444' }}>
                {netBalance >= 0 ? '+' : '-'}${Math.abs(netBalance).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Filters and Search */}
          <div
            style={{
              background: 'rgba(17, 24, 39, 0.6)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px'
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
              <div style={{ flex: '1', minWidth: '250px', position: 'relative' }}>
                <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 12px 12px 44px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.3s'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
                    e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['all', 'income', 'expense'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    style={{
                      padding: '12px 24px',
                      background: filterType === type ? 'linear-gradient(135deg, #15803d 0%, #166534 100%)' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${filterType === type ? 'rgba(21, 128, 61, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '8px',
                      color: filterType === type ? 'white' : '#94a3b8',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => {
                      if (filterType !== type) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.color = 'white';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (filterType !== type) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = '#94a3b8';
                      }
                    }}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Transactions List */}
          <div
            style={{
              background: 'rgba(17, 24, 39, 0.6)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>
                All Transactions ({filteredTransactions.length})
              </h2>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                <Filter size={18} />
                More Filters
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTransactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <p style={{ color: '#64748b', fontSize: '14px' }}>No transactions found</p>
                </div>
              ) : (
                filteredTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    onClick={() => handleRowClick(transaction)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      transition: 'all 0.3s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(15, 23, 42, 0.6)';
                      e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.3)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(15, 23, 42, 0.4)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: transaction.type === 'income' ? 'rgba(134, 239, 172, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          transition: 'all 0.3s'
                        }}
                      >
                        {transaction.type === 'income' ? (
                          <ArrowUpRight size={24} style={{ color: '#86efac' }} />
                        ) : (
                          <ArrowDownRight size={24} style={{ color: '#ef4444' }} />
                        )}
                      </div>
                      <div>
                        <p style={{ color: 'white', fontWeight: '600', fontSize: '15px', marginBottom: '4px' }}>
                          {transaction.description || transaction.name}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#64748b', fontSize: '13px' }}>
                            {new Date(transaction.date).toLocaleDateString()}
                          </span>
                          <span style={{ color: '#334155' }}>•</span>
                          <span style={{ color: '#64748b', fontSize: '13px' }}>
                            {transaction.category?.name || 'Uncategorized'}
                          </span>
                          {transaction.account?.name && (
                            <>
                              <span style={{ color: '#334155' }}>•</span>
                              <span style={{ color: '#64748b', fontSize: '13px' }}>
                                {transaction.account.name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <p
                        style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: transaction.transaction_type === 'income' ? '#86efac' : transaction.transaction_type === 'transfer' ? '#3b82f6' : 'white'
                        }}
                      >
                        {transaction.transaction_type === 'income' && '+'}
                        {transaction.transaction_type === 'expense' && '-'}
                        ${Math.abs(transaction.amount).toFixed(2)}
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => handleEditClick(e, transaction)}
                          style={{
                            padding: '8px',
                            background: 'rgba(251, 191, 36, 0.1)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            borderRadius: '6px',
                            color: '#fbbf24',
                            cursor: 'pointer',
                            transition: 'all 0.3s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(251, 191, 36, 0.2)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(251, 191, 36, 0.1)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, transaction.id)}
                          style={{
                            padding: '8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            color: '#ef4444',
                            cursor: 'pointer',
                            transition: 'all 0.3s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          </>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', marginTop: '40px' }}>
            Part of {branding.parentBrand} ecosystem
          </div>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      {/* Add Transaction Slide Panel */}
      <SlidePanel
        isOpen={isAddPanelOpen}
        onClose={() => setIsAddPanelOpen(false)}
        title="Add New Transaction"
      >
        <AddTransactionForm
          onSuccess={handleTransactionSuccess}
          onCancel={() => setIsAddPanelOpen(false)}
        />
      </SlidePanel>

      {/* Edit Transaction Slide Panel */}
      <SlidePanel
        isOpen={isEditPanelOpen}
        onClose={() => {
          setIsEditPanelOpen(false);
          setSelectedTransaction(null);
        }}
        title="Edit Transaction"
      >
        {selectedTransaction && (
          <AddTransactionForm
            transaction={selectedTransaction}
            onSuccess={handleTransactionSuccess}
            onCancel={() => {
              setIsEditPanelOpen(false);
              setSelectedTransaction(null);
            }}
          />
        )}
      </SlidePanel>
    </>
  );
};
