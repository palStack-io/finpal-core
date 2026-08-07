import React, { useState, useEffect } from 'react';
import { Search, Plus, ArrowUpRight, ArrowDownRight, Calendar, Edit, Trash2, Loader2 } from 'lucide-react';
import { transactionsApi, Transaction, TransactionPagination } from '../services/api/transactions';
import { useAuthStore } from '../store/authStore';
import { formatMoney, Money, moneyStyle, tabular } from '../styles/money';
import { getBranding } from '../config/branding';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';
import { StatCard } from '../components/StatCard';
import { SectionCard } from '../components/SectionCard';
import { MemberFilter } from '../components/MemberFilter';
import { OwnerBadge } from '../components/OwnerBadge';
import { teamService } from '../services/teamService';
import { TeamMember } from '../types/team';
import type { Scope } from '../utils/scope';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';

const metaTextStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '12px' };

const PER_PAGE = 50;

const pagerButtonStyle = (enabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  background: 'var(--surface-hover)',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: enabled ? 'pointer' : 'not-allowed',
  opacity: enabled ? 1 : 0.5,
});

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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<TransactionPagination | null>(null);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  /**
   * The household, and which member the list is narrowed to (`null` = everyone).
   *
   * `/api/v1/team/members` already excludes demo accounts, so this is the real
   * household — the same list the account owner picker uses. Both the filter and
   * the per-row owner badge hide themselves when it holds one member.
   */
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    teamService.getMembers().then(setMembers).catch(() => setMembers([]));
  }, []);

  const selectedMember = members.find((m) => m.id === memberId) || null;

  // One formatter for the whole app, and it honours the user's currency rather
  // than hardcoding USD as this local copy did.
  const currency = user?.default_currency_code || 'USD';
  const formatCurrency = (amount: number) => formatMoney(amount, { currency });

  /**
   * Debounced so typing does not fire a request per keystroke. The search and
   * type filters are now applied by the server: this page used to load the
   * entire history on every render and filter it here, which meant the three
   * cards above the list described all time regardless of what was shown.
   */
  const [appliedSearch, setAppliedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const data = await transactionsApi.getAll({
        page,
        per_page: PER_PAGE,
        search: appliedSearch || undefined,
        type: filterType === 'all' ? undefined : filterType,
        // Server-side, like `search` and `type`, so `summary` covers the same
        // rows the list does. See MemberFilter's docstring.
        member_id: memberId || undefined,
      });
      setTransactions(data.transactions);
      setTotalIncome(data.summary.total_income);
      setTotalExpense(data.summary.total_expense);
      setNetBalance(data.summary.net_balance);
      setPagination(data.pagination);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [page, appliedSearch, filterType, memberId]);

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

  /**
   * Says how many rows match in total, and which of them is on screen — because
   * with the list bounded to one page, a bare count would be the page size and
   * read as the whole history.
   */
  /**
   * What the three summary cards are describing, given the current filter.
   *
   * A solo household gets no tag at all: with one member "HOUSEHOLD" and "YOURS"
   * are the same set, and tagging a figure with a distinction that does not exist
   * is the noise D-01's tags were criticised for in the first place.
   */
  const soloHousehold = members.length <= 1;
  const scopeTag: Scope | undefined = (() => {
    if (soloHousehold) return undefined;
    if (!memberId) return 'household';
    // `yours` means the signed-in user's own rows. Filtering to a HOUSEMATE is
    // neither `yours` nor `household`, and there is no third tag — so it gets no
    // tag and leans on the subtitle, which names them. Tagging Bob's money
    // "YOURS" on Alice's screen would be exactly the class of untrue label the
    // scope vocabulary exists to prevent.
    return memberId === user?.id ? 'yours' : undefined;
  })();
  const scopeSubtitle = selectedMember
    ? `${selectedMember.name || selectedMember.email} only`
    : undefined;

  const sectionTitle = (() => {
    if (!pagination || pagination.total === 0) return 'All Transactions';
    if (pagination.pages <= 1) return `All Transactions (${pagination.total})`;
    const first = (pagination.page - 1) * pagination.per_page + 1;
    const last = first + transactions.length - 1;
    return `Transactions ${first}–${last} of ${pagination.total}`;
  })();

  // No client-side filtering: `search` and `type` are query parameters now, so
  // the rows here are already the matching ones and `pagination.total` is the
  // count of them across all pages.
  const groupedTransactions = transactions.reduce<Record<string, Transaction[]>>((acc, txn) => {
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
                {/* All three come from the transactions endpoint's `summary`,
                    which the server computes over the whole filtered query — so
                    they describe exactly the rows the filter selected, not the
                    page and not all time.

                    The tag follows the filter rather than being fixed. It read
                    `yours` until 2026-08-06, when the list became household-wide;
                    leaving it would have printed "YOURS" over the household's
                    money, which is worse than no tag at all. This is D-01's tag
                    being retired by the filter rather than deleted: with a control
                    on screen the scope is a choice the user made, and the tag just
                    reflects it back. `subtitle` names the member, because
                    "HOUSEHOLD" and "YOURS" cannot say *which* member. */}
                <StatCard
                  label="Total Income"
                  value={formatMoney(totalIncome, { currency, signed: true })}
                  scope={scopeTag}
                  subtitle={scopeSubtitle}
                  accentColor="#22c55e"
                  icon={<ArrowUpRight size={24} color="#22c55e" />}
                  valueColor="#22c55e"
                />
                <StatCard
                  label="Total Expenses"
                  value={formatMoney(-Math.abs(totalExpense), { currency })}
                  scope={scopeTag}
                  subtitle={scopeSubtitle}
                  accentColor="#ef4444"
                  icon={<ArrowDownRight size={24} color="#ef4444" />}
                  valueColor="#ef4444"
                />
                <StatCard
                  label="Net Balance"
                  value={formatMoney(netBalance, { currency, signed: true })}
                  scope={scopeTag}
                  subtitle={scopeSubtitle}
                  accentColor="#fbbf24"
                  icon={<Calendar size={24} color="#fbbf24" />}
                  valueColor={netBalance >= 0 ? 'var(--brand-green-glow)' : 'var(--accent-red)'}
                />
              </div>

              {/* Search & Filter */}
              <SectionCard title="Filter Transactions">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                  {/* Renders nothing for a one-member household. Sits with the
                      other filters rather than in the page header because it is
                      one of three server-side filters, not a mode switch. */}
                  <MemberFilter
                    members={members}
                    value={memberId}
                    onChange={(id) => { setMemberId(id); setPage(1); }}
                  />
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
                        onClick={() => { setFilterType(type); setPage(1); }}
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
                <SectionCard title={sectionTitle}>
                  {transactions.length === 0 ? (
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
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={metaTextStyle}>{transaction.category?.name || 'Uncategorized'}</span>
                                    {transaction.account?.name && (
                                      <>
                                        <span style={metaTextStyle}>·</span>
                                        <span style={metaTextStyle}>{transaction.account.name}</span>
                                      </>
                                    )}
                                    {/* Whose money this row is. Free: the owner
                                        already rides along on the nested account,
                                        so this costs no extra request. Hidden for
                                        a one-member household by the component. */}
                                    <OwnerBadge
                                      owner={transaction.account?.owner}
                                      memberCount={members.length}
                                      size="sm"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                                {/* The ledger column. Tabular figures and a real
                                    minus sign so the amounts line up down the
                                    list; previously a hyphen was glued on outside
                                    the number, which knocked every negative row
                                    a fraction out of alignment. */}
                                <p style={{
                                  fontSize: '15px', fontWeight: 700, margin: 0,
                                  ...tabular,
                                  color: transaction.transaction_type === 'income' ? 'var(--brand-green-glow)'
                                    : transaction.transaction_type === 'transfer' ? 'var(--accent-blue)'
                                    : 'var(--accent-red)',
                                }}>
                                  {formatMoney(
                                    transaction.transaction_type === 'expense'
                                      ? -Math.abs(transaction.amount)
                                      : Math.abs(transaction.amount),
                                    { currency, signed: transaction.transaction_type === 'income' },
                                  )}
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

                  {/* Pagination. The list is one page now, so without these the
                      rest of the history would be unreachable rather than
                      merely off-screen. */}
                  {pagination && pagination.pages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '20px', marginTop: '8px', borderTop: '1px solid var(--border-light)' }}>
                      <button
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        disabled={!pagination.has_prev}
                        style={pagerButtonStyle(pagination.has_prev)}
                      >
                        Previous
                      </button>
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        Page {pagination.page} of {pagination.pages}
                      </span>
                      <button
                        onClick={() => setPage((current) => current + 1)}
                        disabled={!pagination.has_next}
                        style={pagerButtonStyle(pagination.has_next)}
                      >
                        Next
                      </button>
                    </div>
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
