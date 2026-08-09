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
import { accountService, Account } from '../services/accountService';
import { TeamMember } from '../types/team';
import type { Scope } from '../utils/scope';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
import { apiErrorMessage } from '../utils/apiError';

/* The row's second line. 13px/400 — the direction's meta size. The COLOUR is
   unchanged (`--text-muted`, exactly as today): this slice moves structure and
   type, never what a colour means. */
const metaTextStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '13px', fontWeight: 400 };

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

  /**
   * The account axis of "show a dimension only when it varies".
   *
   * The person axis of that rule ALREADY SHIPPED — `MemberFilter` and
   * `OwnerBadge` both return null at one member. The account axis did not: the
   * row keyed the account name on the account *existing*
   * (`transaction.account?.name &&`), never on how many accounts there are, so a
   * one-account instance repeated the same name down all 50 rows. That is
   * exactly the noise the rule exists to remove, and for a self-hosted finance
   * app one account is a common shape rather than an edge case.
   *
   * `null` means "not answered yet" and is deliberately distinct from `[]`,
   * which means "answered: none". Collapsing them would make the very first
   * render look like a zero-account instance and flash the wrong subtitle.
   */
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    accountService.getAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const accountCount = accounts?.length ?? 0;
  /**
   * At one account its name is the useful fact and the count is noise; at two or
   * more the count is the useful fact and no single name is true. Anything else
   * — still loading, or a genuinely empty instance — keeps the generic line,
   * because naming and counting are both meaningless there and an empty subtitle
   * is worse than a plain one.
   */
  const pageSubtitle = accounts === null || accountCount === 0
    ? 'Track all your income and expenses'
    : accountCount === 1
      ? accounts[0].name
      : `Across ${accountCount} accounts`;

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
      setError(apiErrorMessage(err, 'Failed to load transactions'));
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
        alert(apiErrorMessage(err, 'Failed to delete transaction'));
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
        <div className="page-container">

          {/* Header */}
          <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 className="page-title">Transactions</h1>
              <p className="fp-hint">{pageSubtitle}</p>
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

              {/* Transactions grouped by date.
                  ONE SURFACE, ROWS AS HAIRLINES INSIDE IT — the move the "kitchen
                  table" direction rests on: the radius belongs to the container,
                  not the row. This was 50 nested cards on one screen (PER_PAGE is
                  50, right above), each with its own border, radius, background,
                  translate-on-hover and 44px coloured icon tile. A realistic
                  50-row page over 12 date groups goes 4404px -> 3875px: 12.0%
                  shorter, 529px less scroll. The pitch alone improves by 16.1%,
                  but quoting that times 50 overstates the page by a fifth,
                  because the date-group header here is taller.

                  The list is no longer a SectionCard: its rows have to reach the
                  container's edges for the hairlines to work, and SectionCard's
                  24px padding is what stops them. SectionCard is shared with
                  Dashboard, so it is left alone rather than given a variant —
                  the styling lives in `.fp-ledger*` in finpal-theme.css, where
                  :focus-within and (hover:none) can be expressed at all.

                  COLOURS ARE UNTOUCHED HERE. Whether an ordinary expense stops
                  being red is O1, it is the owner's call, and it has not been
                  answered — so every amount below keeps exactly the colour it
                  has today. */}
              <div style={{ marginTop: '24px' }}>
                <h3 className="fp-section-title">{sectionTitle}</h3>
                <div className="fp-ledger">
                  {transactions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 0' }}>
                      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No transactions found</p>
                    </div>
                  ) : (
                    Object.entries(groupedTransactions).map(([dateLabel, txns]) => (
                      <React.Fragment key={dateLabel}>
                        <p className="fp-ledger-group">{dateLabel}</p>
                        <ul className="fp-ledger-rows">
                          {txns.map((transaction) => (
                            <li
                              key={transaction.id}
                              className="fp-ledger-row"
                              onClick={() => handleRowClick(transaction)}
                            >
                              {/* THE 44px COLOURED ICON TILE IS GONE, and it took a
                                  contradiction with it. The tile's ternary only
                                  special-cased `income`, so a TRANSFER drew the red
                                  down-arrow on a red tint — while its amount was
                                  painted blue and shown POSITIVE, because the
                                  negation only applies to `expense`. One row, two
                                  readers disagreeing about what a transfer is:
                                  D-52's shape, in paint. The tile's red disappears
                                  here as a consequence of removing the tile, NOT as
                                  a decision about what a colour means — that is O1
                                  and it is untouched. The amount below still reads
                                  blue and positive, exactly as it does today. */}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div>
                                  <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '15px', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {transaction.description || transaction.name}
                                  </p>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginTop: '2px' }}>
                                    <span style={metaTextStyle}>{transaction.category?.name || 'Uncategorized'}</span>
                                    {/* Named only when there is more than one
                                        account to tell apart. On a one-account
                                        instance this repeated the same name down
                                        all 50 rows — the account was never the
                                        variable, so it was never information. */}
                                    {accountCount > 1 && transaction.account?.name && (
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
                                <p className="fp-ledger-amount" style={{
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
                                {/* Quiet, and revealed rather than always shouting.
                                    Each button carried a tinted background and a
                                    tinted border, so 50 rows put 100 more colour
                                    events on the screen than the amounts did. The
                                    class handles reveal-on-hover, reveal-on-focus
                                    (a keyboard has no hover) and always-visible on a
                                    coarse pointer (a tablet has no hover either).
                                    ARIA LABELS ARE UNCHANGED — opacity keeps these
                                    in the accessibility tree throughout. */}
                                <div className="fp-ledger-acts">
                                  <button
                                    onClick={(e) => handleEditClick(e, transaction)}
                                    aria-label="Edit transaction"
                                    style={{ width: '32px', height: '32px', background: 'transparent', border: '1px solid var(--border-medium)', borderRadius: '999px', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'color 0.2s, border-color 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--text-secondary)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-medium)'; }}
                                  >
                                    <Edit size={14} />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteClick(e, transaction.id)}
                                    aria-label="Delete transaction"
                                    style={{ width: '32px', height: '32px', background: 'transparent', border: '1px solid var(--border-medium)', borderRadius: '999px', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'color 0.2s, border-color 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-red)'; e.currentTarget.style.borderColor = 'var(--accent-red)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-medium)'; }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </React.Fragment>
                    ))
                  )}

                  {/* Pagination. The list is one page now, so without these the
                      rest of the history would be unreachable rather than
                      merely off-screen. It sits INSIDE the surface, below the
                      hairline that closes the last group. */}
                  {pagination && pagination.pages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 24px', borderTop: '1px solid var(--border-light)' }}>
                      <button
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        disabled={!pagination.has_prev}
                        style={pagerButtonStyle(pagination.has_prev)}
                      >
                        Previous
                      </button>
                      <span className="fp-meta">
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
                </div>
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
            /**
             * **`key` is load-bearing, not tidiness.** The form seeds its splits
             * editor from `transaction` in a lazy `useState` initializer, which
             * runs once per mount. Selecting a second row without the panel
             * closing in between (`handleRowClick` sets the transaction and
             * opens the panel; it does not null it first) would reuse the
             * component and leave row A's splits in row B's editor — and since
             * D-54 an editor's contents are WRITTEN BACK, so saving would
             * corrupt B. Remounting per id makes the initializer's contract
             * true by construction rather than by luck of the unmount order.
             */
            key={selectedTransaction.id}
            transaction={selectedTransaction}
            onSuccess={handleTransactionSuccess}
            onCancel={() => { setIsEditPanelOpen(false); setSelectedTransaction(null); }}
          />
        )}
      </SlidePanel>
    </>
  );
};
