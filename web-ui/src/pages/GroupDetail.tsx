import React, { useState, useEffect } from 'react';
import PageHead from '../components/PageHead';
import { TotalsRow } from '../components/dashboard/TotalsRow';
import { useAuthStore } from '../store/authStore';
import { settlementFor } from '../utils/groupSettlement';
import type { GroupBalance } from '../services/api/groups';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, DollarSign, TrendingUp, TrendingDown, CheckCircle, Settings, UserPlus, Receipt, X, Trash2 } from 'lucide-react';
import { getBranding } from '../config/branding';
import { useToast } from '../contexts/ToastContext';
import { api } from '../services/api';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';
import { Transaction } from '../services/api/transactions';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
// `formActionsStyle` is used by the settings modal's button row and was never
// imported — a plain undefined-name error that nothing reported, because the
// typecheck gate compiled zero files (D-45).
import { formActionsStyle } from '../styles/formStyles';
import { apiErrorMessage } from '../utils/apiError';
import { useSurfaceCoins } from '../contexts/CoinAwardContext';

interface Member {
  id: string;
  name: string;
  email: string;
  balance: number; // positive = they owe, negative = they're owed
}

/**
 * *** `Balance` IS NOW THE SHARED `GroupBalance`, IDS AND ALL. *** The local
 * copy declared `from`/`to`/`amount` only, so this page could not tell WHICH
 * member a debt belonged to and had to fall back to the per-member `balance`
 * field for that — which is how the same debt came to be on screen twice. See
 * the settlement note below.
 */
type Balance = GroupBalance;

interface GroupData {
  id: number;
  name: string;
  description: string;
  created_by: string;
  /**
   * How many expenses are recorded against this group.
   *
   * *** OPTIONAL BECAUSE A SELF-HOSTER'S SERVER MAY NOT SEND IT. *** The field
   * was added to `GET /groups/<id>` on 2026-09-16; a deployment on an older
   * image omits it, and `undefined` must render as "we were not told", never as
   * the number 0. An empty group and an unanswerable question are different
   * statements and only one of them is about the group.
   */
  expense_count?: number;
  members: Member[];
}

const sectionCardStyle: React.CSSProperties = { background: 'var(--bg-card)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px' };
const sectionTitleStyle: React.CSSProperties = { fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' };
const secondaryBodyStyle: React.CSSProperties = { color: 'var(--text-secondary)', marginBottom: '24px' };
const fieldLabelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' };
const secondaryBgStyle: React.CSSProperties = { background: 'var(--bg-secondary)' };
const truncatedTextStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '13px', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const subheadStyle: React.CSSProperties = { fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' };
const smallBodyStyle: React.CSSProperties = { fontSize: '14px', color: 'var(--text-secondary)' };
const labelStyle: React.CSSProperties = { color: 'var(--text-primary)', fontWeight: '500', marginBottom: '4px' };
const smallMetaStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--text-secondary)' };

/* Lifted out of the render: an object literal in JSX is a new object on every
   keystroke in the group-name field, and `sidebarAndStatCardsMeasured` reads
   these as declarations rather than as inline noise. */
/* *** `--g-wash` / `--g-ink`, BECAUSE THIS BUTTON MOVED ONTO A DIFFERENT
   SURFACE AND THAT IS THE WHOLE OF D-229. *** It was
   `rgba(21, 128, 61, 0.2)` with `--brand-main-green` on top, which is legible
   on the page card (5.27:1) and NOT on a page head's sky: the translucent wash
   composites to #b4d2be there, and #15803d on that is 4.38:1. Moving
   Investments' actions into `PageHead` failed exactly this way, and the opaque
   token was created for it. Moving these actions into `PageHead` failed the
   same way within one run of the contrast walk — the second time, on a surface
   the walk could only see because `groupdetail` was added to the capture in the
   same commit. */
const addMemberButtonStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: 'var(--g-wash)',
  border: '1px solid var(--g-wash)',
  borderRadius: '8px',
  color: 'var(--g-ink)',
  cursor: 'pointer',
  fontWeight: '600',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
};

const groupSettingsButtonStyle: React.CSSProperties = {
  padding: '10px',
  background: 'var(--surface-hover)',
  border: 'none',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

/** Marks which member the reader is. A fact, not a figure. */
const youTagStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-medium)',
  borderRadius: '999px',
  padding: '3px 9px',
};

export const GroupDetail: React.FC = () => {
  // The page names its own surface and nothing more; the server owns
  // which acts a `groups` mutation can move. Fires on mount as well as
  // on demand, so an unwired mutation handler still gets its moment.
  useSurfaceCoins('groups');
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

  /**
   * *** ONE FIGURE PER FACT, AND THAT IS THE WHOLE FIX. ***
   *
   * This page showed one debt as two different numbers, eight lines apart. On
   * the live demo `/groups/1` listed Alex Demo at **$178.03** in Members and
   * said *"Alex Demo owes Jordan Demo $178.02"* in Balances directly below it.
   * Neither was a bug in isolation: the true figure is `-178.025`, the members
   * list rounded half-up from `members[].balance`, and `simplified_debts`
   * arrives from the server already rounded to 178.02. Two roundings of one
   * half-cent, rendered next to each other. AUDIT D-235.
   *
   * The fix is not a rounding mode — a rounding mode makes the two agree today
   * and leaves two sources to disagree tomorrow. It is to stop showing the same
   * debt twice: `simplified_debts` is the server's canonical answer and the one
   * `/groups` already sums, so the settlement comes from there and the members
   * list lists PEOPLE. There is no second source left on the screen for the
   * first one to disagree with.
   *
   * And it reuses `settlementFor` rather than adding a sum here: the Groups
   * page's totals and this page's totals are now the same arithmetic on the
   * same field, which is the other half of not having two answers. A group with
   * any id-less line is refused whole rather than partly counted — see that
   * file for why a name match would be the defect.
   */
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const settlement = settlementFor(currentUserId, [{
    groupId: Number(id),
    groupName: group?.name ?? '',
    balances,
  }]);
  const unreadable = settlement.unreadable.length > 0;

  /** Pluralised once, because "1 members" is the tell of a count printed raw. */
  const memberCount = group?.members?.length ?? 0;
  const memberCountLabel = `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`;

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
      showToast(apiErrorMessage(error, 'Failed to record settlement'), 'error');
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
      showToast(apiErrorMessage(error, 'Failed to add member'), 'error');
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
      showToast(apiErrorMessage(error, 'Failed to update group'), 'error');
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
        <div style={{ minHeight: '100vh', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: '18px' }}>Loading...</div>
        </div>
      </>
    );
  }

  if (!group) {
    return (
      <>
        <div style={pageContainerStyle}>
          <div style={{ color: 'var(--text-primary)', fontSize: '18px' }}>Group not found</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={pageContainerStyle}>
        <div className="page-container">

          {/* Header */}
          <div>
            <button
              onClick={() => navigate('/groups')}
              style={{
                padding: '8px 16px',
                background: 'var(--surface-hover)',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--text-primary)',
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

            {/* *** THIS PAGE WAS NEVER REACHED BY THE PAGE-SHELL SWEEP. ***
                `pageShells.test.ts` flags a page that renders an `h1` WITHOUT
                `PageHead`, and this one rendered its title through
                `className="page-title"` on an h1 inside a hand-rolled flex row
                — so the sweep saw an h1, saw no head, and… actually it did flag
                it; what it never got was a mockup, because no sheet covered
                `/groups/:id`. `docs/mockups/orphan-pages-web.html` is that
                sheet. Unlike Settings there is no competing shell here and no
                exemption to delete: it is a top-level route with one subject,
                reached from a card that already has a head. */}
            <PageHead
              band="groups"
              title={group.name}
              subtitle={
                group.description
                  ? `${group.description} · ${memberCountLabel}`
                  : memberCountLabel
              }
              right={
                <>
                  <button
                    onClick={() => setShowAddMemberModal(true)}
                    style={addMemberButtonStyle}
                  >
                    <UserPlus size={16} /> Add Member
                  </button>
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    aria-label="Group settings"
                    style={groupSettingsButtonStyle}
                  >
                    <Settings size={16} />
                  </button>
                </>
              }
            >
              {/* *** THE THREE HEADLINE FIGURES, EACH FROM EXACTLY ONE SOURCE.
                  *** Inside the head's card rather than in cards of their own —
                  `sidebarAndStatCardsMeasured` refuses a hand-rolled stat grid
                  where `TotalsRow` exists. */}
              <TotalsRow cells={[
                {
                  label: 'You owe',
                  value: unreadable
                    ? '—'
                    : `${branding.currencySymbol}${settlement.youOwe.toFixed(2)}`,
                  valueColor: settlement.youOwe > 0 ? 'var(--re-ink)' : undefined,
                  note: unreadable
                    ? 'this server does not say who owes whom'
                    : (settlement.yourDebts.length
                      ? `to ${settlement.yourDebts.map((d) => d.to).join(', ')}`
                      : 'you owe nothing here'),
                },
                {
                  label: 'You are owed',
                  value: unreadable
                    ? '—'
                    : `${branding.currencySymbol}${settlement.youAreOwed.toFixed(2)}`,
                  note: unreadable
                    ? 'this server does not say who owes whom'
                    : (settlement.youAreOwed > 0
                      ? 'waiting to be settled'
                      : 'nobody owes you here'),
                },
                {
                  /* *** ABSENT IS NOT ZERO, AND THIS FIELD IS THE REASON THE
                     PANEL BELOW USED TO LIE. *** `expense_count` arrives from
                     the server; `undefined` means an older deployment did not
                     send it, and rendering that as "0 expenses" is the false
                     statement D-236 is about. */
                  label: 'Recorded',
                  value: group.expense_count === undefined
                    ? '—'
                    : `${group.expense_count} ${group.expense_count === 1 ? 'expense' : 'expenses'}`,
                  note: group.expense_count === undefined
                    ? 'this server does not report a count'
                    : 'since the group was made',
                },
              ]} />
            </PageHead>

            {/* Repeated from `/groups` on purpose, not by drift: it is the one
                thing a reader must not get wrong about this page, and the two
                screens are one flow. Repeating a SENTENCE is not D-101;
                repeating a CALCULATION is, which is what the settlement above
                stopped doing. */}
            <p style={{
              margin: '0 0 24px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
            }}>
              A bill you are splitting is not money you spent, so none of this
              touches your budgets or your goals.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '24px' }}>

            {/* Members Card */}
            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '12px' }}>
                  <Users size={24} color="#3b82f6" />
                </div>
                <div>
                  <h2 style={subheadStyle}>
                    Members
                  </h2>
                  <p style={smallBodyStyle}>{group.members?.length || 0} members</p>
                </div>
              </div>

              <div style={flexColGap12}>
                {group.members?.map((member) => (
                  <div
                    key={member.id}
                    style={{
                      padding: '16px',
                      background: 'var(--surface-hover)',
                      borderRadius: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={labelStyle}>{member.name || member.email}</div>
                      <div style={smallMetaStyle}>{member.email}</div>
                    </div>
                    {/* *** THE PER-MEMBER FIGURE IS GONE, AND IT IS THE HALF OF
                        D-235 THAT HAD TO GO. *** This rendered
                        `Math.abs(member.balance).toFixed(2)` — a SECOND rounding
                        of the same debt the settlement above states, from a
                        different field, eight lines apart on screen. `-178.025`
                        became $178.03 here and $178.02 there. Deleting one of
                        the two sources is the only fix that cannot recur; a
                        rounding mode would make them agree today.
                        `member.balance` is still in the payload and still typed,
                        because the SettleUp modal and the API contract both use
                        it — what changed is that the page does not render two
                        answers to one question. Who is `you` is marked instead,
                        which is a fact the list can state without arithmetic. */}
                    {member.id === currentUserId && (
                      <span style={youTagStyle}>you</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Balances Card */}
            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.2)', borderRadius: '12px' }}>
                  <DollarSign size={24} color="#22c55e" />
                </div>
                <div>
                  <h2 style={subheadStyle}>
                    Balances
                  </h2>
                  <p style={smallBodyStyle}>Who owes whom</p>
                </div>
              </div>

              <div style={flexColGap12}>
                {balances.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <CheckCircle size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                    <p>All settled up!</p>
                  </div>
                ) : (
                  balances.map((balance, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        background: 'var(--surface-hover)',
                        borderRadius: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600' }}>{balance.from}</span>
                          {' owes '}
                          <span style={{ fontWeight: '600' }}>{balance.to}</span>
                        </div>
                        {/* *** `--brand-green-glow` IS 2.27:1 ON THE LIGHT CARD, AND
                            THIS IS THE FIGURE A USER IS ABOUT TO SEND MONEY
                            AGAINST. *** Pre-existing, not introduced here — and
                            unmeasured until `groupdetail` joined the contrast
                            capture, because one green was being used against two
                            very different backgrounds. `--amount-income` is the
                            theme-aware pair the theme file created for exactly
                            this: #15803d at 4.87:1 in light, the glow at 6.42:1
                            in dark. */}
                        <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--amount-income)' }}>
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
          <div style={sectionCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '12px' }}>
                <Receipt size={24} color="#f59e0b" />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)' }}>
                Recent Transactions
              </h2>
            </div>

            {/* *** "No transactions yet" WAS A FALSE STATEMENT ABOUT A GROUP WITH
                TWO OF THEM. *** Measured on the live demo: `/groups` showed
                "Apartment Roommates · 2 expenses", and this panel — whose only
                source is `/api/v1/transactions/?group_id=1`, which returns 0
                rows while the unfiltered list returns 37 — greeted the reader
                with a cheerful empty state. `/api/v1/groups/1/expenses` is a
                404; there is no such route. AUDIT D-236.

                Whether the filter is unsupported or those two expenses are
                scoped away from this user is a backend question this change
                does NOT answer, and claiming a cause without proving it is how
                three earlier passes went wrong. What it does is stop the panel
                asserting something the page contradicts: with a count in hand
                it says the expenses exist and could not be listed, and only
                calls the group empty when the server says it is empty.

                This is D-77's lesson — an empty demo hid three defects — turned
                into a dependency rather than a decoration. */}
            {transactions.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                {group.expense_count === undefined ? (
                  <>
                    Nothing to show here. This server does not report how many
                    expenses the group has, so finPal cannot tell an empty group
                    from a list it failed to load.
                  </>
                ) : group.expense_count > 0 ? (
                  <>
                    This group has {group.expense_count}{' '}
                    {group.expense_count === 1 ? 'expense' : 'expenses'} recorded,
                    and none of them could be listed here. They are still counted
                    in the balances above.
                  </>
                ) : (
                  <>No expenses have been added to this group yet.</>
                )}
              </div>
            ) : (
              <div style={flexColGap12}>
                {transactions.slice(0, 10).map((transaction) => (
                  <div
                    key={transaction.id}
                    onClick={() => setEditingTransaction(transaction)}
                    style={{
                      padding: '16px',
                      background: 'var(--surface-hover)',
                      borderRadius: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--border-light)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--surface-hover)';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={labelStyle}>
                        {transaction.description}
                      </div>
                      <div style={smallMetaStyle}>
                        {transaction.paid_by && `Paid by ${transaction.paid_by} • `}{new Date(transaction.date).toLocaleDateString()}
                        {transaction.category && typeof transaction.category === 'object' && transaction.category.name && ` • ${transaction.category.name}`}
                      </div>
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
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
                background: 'var(--overlay-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}
              onClick={() => setShowSettleModal(false)}
            >
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '16px',
                  padding: '32px',
                  maxWidth: '500px',
                  width: '90%',
                  border: '1px solid var(--border-light)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={sectionTitleStyle}>
                  Record Settlement
                </h2>
                <p style={secondaryBodyStyle}>
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
                      background: 'var(--surface-hover)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
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
                background: 'var(--overlay-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}
              onClick={() => setShowAddMemberModal(false)}
            >
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '16px',
                  padding: '32px',
                  maxWidth: '500px',
                  width: '90%',
                  border: '1px solid var(--border-light)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={sectionTitleStyle}>
                  Add Member
                </h2>
                <p style={secondaryBodyStyle}>
                  Groups are for splitting costs with your household, so you can only add
                  someone who already has an account on this instance.
                </p>
                <input
                  type="email"
                  placeholder="Email address"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="fp-input"
                  style={{ marginBottom: '24px' }}
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
                      background: 'var(--surface-hover)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
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
                background: 'var(--overlay-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}
              onClick={() => setShowSettingsModal(false)}
            >
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '16px',
                  padding: '32px',
                  maxWidth: '500px',
                  width: '90%',
                  border: '1px solid var(--border-light)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={sectionTitleStyle}>
                  Group Settings
                </h2>
                <p style={secondaryBodyStyle}>
                  Update the group name and description.
                </p>
                <div style={{ marginBottom: '16px' }}>
                  <label style={fieldLabelStyle}>
                    Group Name
                  </label>
                  <input
                    type="text"
                    placeholder="Group name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="fp-input"
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={fieldLabelStyle}>
                    Description
                  </label>
                  <textarea
                    placeholder="Group description"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    rows={3}
                    className="fp-input"
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label style={fieldLabelStyle}>
                    Default Split Method
                  </label>
                  <select
                    value={defaultSplitMethod}
                    onChange={(e) => setDefaultSplitMethod(e.target.value)}
                    className="fp-input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="equal" style={secondaryBgStyle}>Equal Split</option>
                    <option value="percentage" style={secondaryBgStyle}>Percentage Split</option>
                    <option value="custom" style={secondaryBgStyle}>Custom Split</option>
                  </select>
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
                    This will be the default method for splitting expenses in this group
                  </p>

                  {/* Custom Split Values */}
                  {defaultSplitMethod === 'custom' && group?.members && (
                    <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                      <p style={{ color: '#93c5fd', fontSize: '13px', marginBottom: '12px', fontWeight: '500' }}>
                        Specify default custom amounts for each member
                      </p>
                      {group.members.map((member) => (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <span style={truncatedTextStyle}>
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
                              background: 'var(--input-bg)',
                              border: '1px solid var(--input-border)',
                              borderRadius: '6px',
                              color: 'var(--text-primary)',
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
                        Specify default percentage split for each member
                      </p>
                      {group.members.map((member) => (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <span style={truncatedTextStyle}>
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
                                background: 'var(--input-bg)',
                                border: '1px solid var(--input-border)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                outline: 'none'
                              }}
                            />
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
                <div style={formActionsStyle}>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: 'var(--surface-hover)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
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
