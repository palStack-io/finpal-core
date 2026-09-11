import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Loader2, Plus, Target, Trash2, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../styles/money';
import { goalFigures } from '../utils/goalFigures';
import { goalTrackingLabel } from '../utils/goalTracking';
import { MountainSilhouette } from '../components/MountainSilhouette';
import { heightForMagnitude } from '../utils/mountainGeometry';
import {
  UNMEASURED_SUBLINE, peakColorVar, peakEyebrow, peakHardestLine,
  peakSubline, peakSummitLine,
} from '../utils/peakCopy';
import { GoalAccountsControl } from '../components/goals/GoalAccountsControl';
import { goalService } from '../services/goalService';
import { accountService, type Account } from '../services/accountService';
import type { Goal, GoalContribution } from '../types/goal';
import { useToast } from '../contexts/ToastContext';
import { apiErrorMessage } from '../utils/apiError';

/**
 * Goals.
 *
 * *** THE PERCENTAGE ON THIS PAGE IS THE SERVER'S. *** `goal.progress`,
 * `goal.direction` and `goal.current_amount` arrive computed and are rendered as
 * they arrive. Deriving any of them here is D-101's shape -- web-ui and mobile
 * spent months disagreeing about the same figure because each worked it out, and a
 * green typecheck was reassuring the whole time.
 *
 * The one thing this page does compute is the *width of a bar*, which is a
 * presentation decision: `progress` is deliberately unclamped by the server, so an
 * overshoot is real information and the bar is what has to stop at 100%.
 */

const fieldLabelStyle: React.CSSProperties = {
  display: 'block', color: 'var(--text-secondary)', fontSize: '14px',
  fontWeight: '500', marginBottom: '8px',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '20px',
};

const mutedSmallStyle: React.CSSProperties = {
  color: 'var(--text-muted)', fontSize: '13px',
};

/* Inline, not a class. *** TAILWIND IS GONE AND A CLASS THAT MATCHES NO RULE
   RENDERS SILENTLY UNSTYLED (D-60). *** The first draft of this page used
   `fp-button-primary`, `fp-icon-button` and `fp-link-button`; none of the three
   exists anywhere in the stylesheets, so all three would have resolved to nothing
   and looked like plain browser buttons. `cssClassesAreDefined.test.ts` catches
   that now, and it caught this. A named role class would be the right home for
   these shells once a SECOND page needs them -- inventing one for a single caller
   is how a rule nothing references drifts from what the app renders. */
const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 20px', background: 'var(--brand-main-green)', border: 'none',
  borderRadius: '10px', color: 'white', fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 20px', background: 'transparent',
  border: '1px solid var(--border-color)', borderRadius: '10px',
  color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer',
  fontSize: '15px',
};

const iconButtonStyle: React.CSSProperties = {
  padding: '6px', background: 'transparent',
  border: '1px solid var(--border-color)', borderRadius: '8px',
  color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex',
  alignItems: 'center',
};

/* `--g-ink`, not `--brand-main-green`. *** THE CONTRAST WALK CAUGHT THIS AND IT IS
   THE SECOND HALF OF D-103's LESSON. *** `--brand-main-green` is #15803d in BOTH
   themes, which reads 4.87:1 on the light page and 3.22:1 on the dark one -- a
   fail. `--g-ink` is the token that THEMES for exactly this job: #166534 light,
   #5fce8b dark, ~7:1 either way. Measure a colour, never match it. */
const linkButtonStyle: React.CSSProperties = {
  padding: 0, background: 'none', border: 'none', color: 'var(--g-ink)',
  cursor: 'pointer', fontSize: '13px', textDecoration: 'underline',
};

/**
 * A goal's bar, capped at 100%.
 *
 * Green for accumulate, blue for paydown -- semantic accents, deliberately not
 * variablized, because they read on both themes. Red is not used: being behind on
 * a savings goal is not an error state, and colouring it like one would make the
 * page nag.
 */
/**
 * *** THE BAR IS THE SCALE'S COLOUR, AND THE COLOUR IS THE NEVER-COMPARE RULE. ***
 * `cost` (monthly interest) and `build` (distance remaining) share no unit, so
 * clay and forest are what stop the two being read against each other -- which
 * means no caption has to say so.
 *
 * Was blue `#3b82f6` for a paydown and `#22c55e` for everything else. The peak
 * variables are theme-aware BECAUSE THEY HAD TO BE: measured against the dark
 * card (#16241A) the mockup's clay is 3.12:1 and its forest 3.22:1 -- large-text
 * only -- so shipping the mockup's literals would have put two AA failures on
 * the eyebrow that states the rule. See `finpal-theme.css`.
 *
 * A goal with NO `peak` (a backend older than mountains) keeps the old colours
 * exactly, because that card must be unchanged.
 */
const progressBarColor = (goal: Goal): string => {
  if (goal.status === 'achieved') return '#22c55e';
  if (goal.peak) return peakColorVar(goal.peak);
  return goal.direction === 'paydown' ? '#3b82f6' : '#22c55e';
};

/** A percentage for display. The server's number, only rounded. */
const percentLabel = (progress: number): string => `${Math.round(progress * 100)}%`;

interface GoalRowProps {
  goal: Goal;
  onArchive: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  /** B12. Every account the caller can see; the server re-checks visibility. */
  accounts: Account[];
  /** Refetch, rather than patching local state: the server owns these figures. */
  onAccountsChanged: () => void | Promise<void>;
}

const GoalRow: React.FC<GoalRowProps> = ({
  goal, onArchive, onDelete, accounts, onAccountsChanged,
}) => {
  const [contributions, setContributions] = useState<GoalContribution[] | null>(null);
  const [loadingContributions, setLoadingContributions] = useState(false);
  const barWidth = Math.min(100, Math.max(0, goal.progress * 100));
  const figures = goalFigures(goal, (amount) => formatMoney(amount, { currency: goal.currency_code }));

  // C1c. `undefined` is load-bearing: see the comment beside the eyebrow.
  const peak = goal.peak;
  // The summit note reads the WATERMARK, never the current band -- the mountain
  // shrinks as the goal succeeds, so a cleared goal sits on the smallest one.
  const cleared = goal.status === 'achieved';
  const summitLine = peak && cleared ? peakSummitLine(peak) : null;
  const hardestLine = peak && cleared ? peakHardestLine(peak) : null;
  // Height is the CLIENT's half of the split: the server picked the mountain,
  // this turns its one number into pixels. `heightForMagnitude` is byte-identical
  // in mobile and its ceilings are gated against the seeded band table (D-185).
  const peakHeight = peak ? heightForMagnitude(peak.magnitude, peak.scale) : 0;

  const loadContributions = async () => {
    if (contributions !== null) {
      setContributions(null);
      return;
    }
    setLoadingContributions(true);
    try {
      const result = await goalService.getContributions(goal.id);
      setContributions(result.contributions);
    } finally {
      setLoadingContributions(false);
    }
  };

  return (
    <div
      style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}
      data-testid={`goal-${goal.id}`}
    >
      {/* C1c. *** THE SILHOUETTE IS ANCHORED TO THE FIGURES, NOT TO THE CARD. ***
          The approved mockup puts it "behind the figures, bottom-right", and on
          the mockup's card those are the same place because the card ends just
          below the progress bar. THE REAL CARD DOES NOT: it carries the account
          pills, the add-account list and the contributions table underneath, so
          anchoring to the card's own bottom edge put an Everest behind a table
          of names -- which read as an accident rather than as a design. Found by
          RENDERING IT AND LOOKING, which no gate here can do: the contrast walk
          reads computed colours and never composites an SVG sitting behind text.

          So the header and the progress bar are wrapped in their own positioning
          context and the mountain stands on the bar's baseline.

          `aria-hidden`, and it never carries a fact on its own -- every number it
          stands behind is also written out in the subline. Absent entirely when
          `peak` is, so a card from a pre-mountain backend is untouched. */}
      <div style={{ position: 'relative' }}>
        {peak && (
          <div
            aria-hidden="true"
            data-testid={`goal-peak-${goal.id}`}
            style={{
              position: 'absolute', right: 0, bottom: 0,
              pointerEvents: 'none', lineHeight: 0,
            }}
          >
            <MountainSilhouette
              band={peak.band}
              height={peakHeight}
              scale={peak.scale}
              unmeasured={peak.unmeasured}
              maxPixelHeight={116}
              decorative
              style={{ opacity: 'var(--peak-backdrop-opacity)' } as React.CSSProperties}
            />
          </div>
        )}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: 16 }}>{goal.name}</strong>
            {goal.scope === 'household' && (
              <span
                title="Shared with everyone in your household"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 12, padding: '2px 8px', borderRadius: 999,
                  background: 'var(--bg-primary)', color: 'var(--text-secondary)',
                }}
              >
                <Users size={12} /> Shared
              </span>
            )}
            {goal.status === 'achieved' && (
              <span
                style={{
                  /* `--brand-main-green` (#15803d), not the #22c55e accent: white
                     on #22c55e measures 2.28:1 and this is 12px text, so it needs
                     4.5:1. The brand green gives 5.02:1 and is already what every
                     white-on-green button in the app uses. */
                  fontSize: 12, padding: '2px 8px', borderRadius: 999,
                  background: 'var(--brand-main-green)', color: 'white',
                }}
              >
                Achieved
              </span>
            )}
            {goal.status === 'archived' && (
              <span style={{ ...mutedSmallStyle, padding: '2px 8px' }}>Archived</span>
            )}
          </div>
          <div style={mutedSmallStyle}>
            {/* B12: NAMES every linked account, where the server's `account_name`
                can only say "2 accounts" — it has to degrade, because a client
                that has not migrated cannot be handed one card's name out of
                three. `goalTrackingLabel` is duplicated in mobile and the two
                case tables are identical on purpose; see its header. */}
            {goalTrackingLabel(goal)}
          </div>
          {/* C1c. *** RENDERS NOTHING WITHOUT `peak`, WHICH IS A THIRD STATE AND
              NOT A FLAVOUR OF UNMEASURED. *** No peak means the backend predates
              mountains, and that card must look exactly as it did before this
              feature — not like a goal whose rate we failed to find. */}
          {peak && (
            <div style={{ marginTop: 6 }}>
              <div style={{
                fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3,
                textTransform: 'uppercase', color: peakColorVar(peak),
              }}>
                {peakEyebrow(peak)}
              </div>
              {/* *** ON A CLEARED GOAL THE SUMMIT NOTE REPLACES THE SUBLINE,
                  IT DOES NOT JOIN IT. *** Rendering both printed "Table Mountain
                  · 1,085 m · $0.00 still to save" above the congratulation --
                  every figure correct and the pair reading as a shrug. Nothing
                  is lost: the subline describes what is left to do, and there is
                  nothing left to do. */}
              {summitLine ? (
                <div style={{ ...mutedSmallStyle, marginTop: 2,
                              color: 'var(--text-primary)' }}>
                  {summitLine}
                  {hardestLine && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {` · ${hardestLine}`}
                    </span>
                  )}
                </div>
              ) : (
                <div style={{
                  ...mutedSmallStyle,
                  marginTop: 2,
                  fontStyle: peak.unmeasured ? 'italic' : undefined,
                }}>
                  {peak.unmeasured
                    ? UNMEASURED_SUBLINE
                    : peakSubline(peak, (amount) => formatMoney(
                        amount, { currency: goal.currency_code })) }
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {goal.status !== 'archived' && (
            <button
              type="button"
              onClick={() => onArchive(goal)}
              aria-label={`Archive ${goal.name}`}
              style={iconButtonStyle}
            >
              <Archive size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(goal)}
            aria-label={`Delete ${goal.name}`}
            style={iconButtonStyle}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div
          style={{
            height: 10, borderRadius: 999, background: 'var(--progress-track)',
            overflow: 'hidden',
          }}
          role="progressbar"
          aria-valuenow={Math.round(goal.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.name} progress`}
        >
          <div style={{ width: `${barWidth}%`, height: '100%', background: progressBarColor(goal) }} />
        </div>
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 8,
            fontSize: 13, color: 'var(--text-secondary)',
          }}
        >
          {/* D-179: the phrasing follows `direction`. "X of Y" is written for an
              accumulation, and reusing it for a paydown is how this line came to
              read "-$800.00 of $0.00" — every figure right, the sentence
              meaningless. `goalFigures` is duplicated in mobile on purpose; see
              its header. */}
          <span>
            {figures.primary}
            {figures.separator !== null && ` ${figures.separator} ${figures.secondary}`}
          </span>
          {/* The server's percentage, rounded for display and nothing else. */}
          <span>{percentLabel(goal.progress)}</span>
        </div>
      </div>
      </div>

      {goal.account_id !== null && (
        <div style={{ marginTop: 12 }}>
          {/* B12. Only on an ACTIVE goal: an archived or achieved one has released
              its accounts, and adding one back would silently make it hold them
              again. Archiving is how a goal lets go. */}
          {goal.status === 'active' && (
            <GoalAccountsControl
              goal={goal}
              accounts={accounts}
              onChanged={onAccountsChanged}
            />
          )}

          <button type="button" onClick={loadContributions} style={linkButtonStyle}>
            {contributions === null ? 'Who contributed?' : 'Hide contributions'}
          </button>
          {loadingContributions && <Loader2 size={14} className="animate-spin" />}
          {contributions !== null && (
            contributions.length === 0
              // An empty list, never a row reading $0.00 -- a zero beside a name
              // reads as a measurement when the truth is there is nothing to show.
              ? <p style={mutedSmallStyle}>No contributions recorded yet.</p>
              : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
                  {contributions.map((row) => (
                    <li
                      key={row.user_id}
                      style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '4px 0', fontSize: 13, color: 'var(--text-secondary)',
                      }}
                    >
                      <span>
                        {row.display_name}
                        {/* *** SHOWN, NOT DROPPED. *** `paid_by` defaults to whoever
                            created the row, so an imported one credits the importer
                            rather than the payer. Rendering the amount without this
                            tells one partner they contributed money the other paid. */}
                        {row.imported && (
                          <span
                            style={{ ...mutedSmallStyle, marginLeft: 6 }}
                            title="Some of these rows were imported, so they are credited to whoever imported them rather than to whoever paid."
                          >
                            (includes imported rows)
                          </span>
                        )}
                      </span>
                      <span>{formatMoney(row.amount, { currency: goal.currency_code })}</span>
                    </li>
                  ))}
                </ul>
              )
          )}
        </div>
      )}
    </div>
  );
};

export const Goals: React.FC = () => {
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [targetAmount, setTargetAmount] = useState('');
  const [scope, setScope] = useState<'personal' | 'household'>('personal');
  const [targetDate, setTargetDate] = useState('');

  const currency = user?.default_currency_code || 'USD';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedGoals, fetchedAccounts] = await Promise.all([
        goalService.getGoals(),
        // Only to populate the link picker. A failure here must not hide the goals.
        accountService.getAccounts().catch(() => [] as Account[]),
      ]);
      setGoals(fetchedGoals);
      setAccounts(fetchedAccounts);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load your goals.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => goals.filter((g) => g.status !== 'archived'), [goals]);
  const archived = useMemo(() => goals.filter((g) => g.status === 'archived'), [goals]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      // `start_amount` is NOT sent for a linked goal, and the server would ignore it
      // anyway: the snapshot is taken from the balance the server reads, which is the
      // whole reason a linked goal's progress cannot be inflated.
      await goalService.createGoal({
        name,
        scope,
        /*
         * *** `account_ids`, AND AN EMPTY LIST MEANS "TRACKED BY HAND". *** The
         * server treats [] as a manual goal rather than falling back to the
         * singular `account_id`, so this is a positive statement and not an
         * omission. The singular is not sent at all: a client that has migrated
         * says what it means with one key.
         */
        account_ids: accountIds,
        target_amount: Number(targetAmount),
        target_date: targetDate === '' ? null : targetDate,
      });
      setShowForm(false);
      setName(''); setAccountIds([]); setTargetAmount(''); setTargetDate('');
      setScope('personal');
      await load();
    } catch (err) {
      setFormError(apiErrorMessage(err, 'Could not create this goal.'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (goal: Goal) => {
    try {
      await goalService.archiveGoal(goal.id);
      await load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not archive this goal.'), 'error');
    }
  };

  const handleDelete = async (goal: Goal) => {
    try {
      await goalService.deleteGoal(goal.id);
      await load();
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not delete this goal.'), 'error');
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 24, gap: 12, flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="page-title">Goals</h1>
          <p className="fp-hint">
            Link a goal to an account and finPal works the progress out from the
            balance, so the number is never one you typed.
          </p>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> New goal
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label htmlFor="goal-name" style={fieldLabelStyle}>Name</label>
              <input
                id="goal-name" className="fp-input" value={name} required
                onChange={(e) => setName(e.target.value)}
                placeholder="Pay off Chase Amazon"
              />
            </div>
            <div>
              <span style={fieldLabelStyle}>Accounts</span>
              {/* *** A CHECKBOX LIST, NOT `<select multiple>`. *** The native
                  multi-select needs a modifier key nobody discovers, shows two
                  rows by default, and has no accessible name per option. A goal
                  spanning three cards is the case this feature exists for, so
                  the control that expresses it has to be obvious. */}
              {accounts.length === 0 ? (
                <p className="fp-hint">
                  You have no accounts yet, so this goal will be tracked by hand.
                </p>
              ) : (
                <div
                  role="group"
                  aria-label="Accounts this goal tracks"
                  style={{ display: 'grid', gap: 8 }}
                >
                  {accounts.map((account) => (
                    <label
                      key={account.id}
                      htmlFor={`goal-account-${account.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer',
                      }}
                    >
                      <input
                        id={`goal-account-${account.id}`}
                        type="checkbox"
                        checked={accountIds.includes(account.id)}
                        onChange={(e) => setAccountIds((current) => (
                          e.target.checked
                            ? [...current, account.id]
                            : current.filter((id) => id !== account.id)
                        ))}
                      />
                      {account.name}
                    </label>
                  ))}
                </div>
              )}
              <p className="fp-hint">
                {/* *** THE ONE SENTENCE THAT MAKES THE FEATURE COMPREHENSIBLE. ***
                    Several accounts, one percentage — and they must be on the
                    same side of zero, which the server enforces and names.
                    Unticking everything is a positive choice, not an omission. */}
                Pick as many as you like — three cards under one payoff goal, or
                two savings accounts under one fund. They must all be the same
                kind: money you are paying down, or money you are building up.
                finPal snapshots where each account starts from now, and that
                snapshot never changes. Leave them all unticked to track this
                goal by hand.
              </p>
            </div>
            <div>
              <label htmlFor="goal-target" style={fieldLabelStyle}>
                Target amount ({currency})
              </label>
              <input
                id="goal-target" className="fp-input" value={targetAmount} required
                inputMode="decimal"
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="10000"
              />
              <p className="fp-hint">
                For paying a card off, the target is 0 — a card you owe money on has
                a negative balance.
              </p>
            </div>
            <div>
              <label htmlFor="goal-scope" style={fieldLabelStyle}>Who is this for</label>
              <select
                id="goal-scope" className="fp-input" value={scope}
                onChange={(e) => setScope(e.target.value as 'personal' | 'household')}
              >
                <option value="personal">Just me</option>
                <option value="household">Everyone in my household</option>
              </select>
            </div>
            <div>
              <label htmlFor="goal-target-date" style={fieldLabelStyle}>
                Target date (optional)
              </label>
              <input
                id="goal-target-date" className="fp-input" type="date" value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            {formError && (
              <div role="alert" style={{ color: '#ef4444', fontSize: 14 }}>{formError}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={primaryButtonStyle} disabled={saving}>
                {saving ? 'Saving…' : 'Create goal'}
              </button>
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {loading && <Loader2 size={20} className="animate-spin" aria-label="Loading goals" />}
      {error && <div role="alert" style={{ color: '#ef4444' }}>{error}</div>}

      {!loading && !error && goals.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <Target size={28} style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
            No goals yet. Link one to an account and finPal will track it for you.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {active.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            onArchive={handleArchive}
            onDelete={handleDelete}
            accounts={accounts}
            onAccountsChanged={load}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Archived
          </h2>
          <div style={{ display: 'grid', gap: 16 }}>
            {archived.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onArchive={handleArchive}
                onDelete={handleDelete}
                accounts={accounts}
                onAccountsChanged={load}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Goals;
