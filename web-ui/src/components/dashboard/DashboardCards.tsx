/**
 * The cards under the Dashboard hero (Dashboard C, core edition, 2026-11-20).
 *
 *   row 1:  Where November went (wide)            | Your skills, compact
 *   row 2:  Budgets | Accounts | Goals
 *
 * Every figure here is one the app already has: the month's out and in are the hero's own figures, the split is the
 * spending summary the share bar always drew, budgets and the pace mark are `/budgets/overview` (the server's `pace`
 * and per-row `pace_applies`), accounts are `/accounts`, goals are `/goals` with the server's `progress` and
 * `goalFigures` for the words. No new money maths. Motion is plain CSS: bars grow once (`.fp-fill`, a scaleX
 * keyframe, never a width transition) and the pace mark fades in after (`.fp-mark-in`); reduced motion: at rest.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Banknote, CreditCard, Landmark, LineChart, PiggyBank, Receipt, Wallet } from 'lucide-react';
import { SectionCard } from '../SectionCard';
import { ShareBar } from './ShareBar';
import { formatMoney, tabular } from '../../styles/money';
import { goalFigures } from '../../utils/goalFigures';
import { goalProgress } from '../../utils/goalPeak';
import { staggerStyle } from '../../utils/entrance';
import { TRAIL_MARKS } from '../../modules/learnpal/SkillsCard';
import type { SpendingGroup } from '../../services/api/spendingSummary';
import type { BudgetOverview, BudgetPace } from '../../services/budgetService';
import type { Goal } from '../../types/goal';
import type { SkillProgress } from '../../types/learnpal';

const CardLink: React.FC<{ to: string; children: React.ReactNode; testId?: string }> = ({ to, children, testId }) => (
  <Link to={to} className="fp-dash-link" data-testid={testId}>{children}</Link>
);

/** A bar that grows once from 0 to `value` (0..1). The width is the value; the growth is a transform. */
const Fill: React.FC<{ value: number; index: number; colour: string; testId?: string; extra?: Record<string, string> }> = (
  { value, index, colour, testId, extra },
) => (
  <div className="fp-dash-bars__fill" data-testid={testId} data-width={`${Math.max(0, Math.min(1, value)) * 100}%`} {...extra}>
    <div className="fp-fill" style={staggerStyle(index, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: colour })} />
  </div>
);

/* ── Where the month went ─────────────────────────────────────────────────────────────────────────────────────── */

export interface WhereMonthWentProps {
  month: string;
  /** The hero's own "Monthly Expenses" and "Monthly Income" figures, so the two never disagree on one screen. */
  wentOut: number;
  cameIn: number;
  currency: string;
  memberCount: number;
  byCategory: SpendingGroup[];
  byPerson: SpendingGroup[];
}

export const WhereMonthWentCard: React.FC<WhereMonthWentProps> = ({ month, wentOut, cameIn, currency, memberCount, byCategory, byPerson }) => {
  const money = (n: number) => formatMoney(n, { currency });
  const hasSplit = byCategory.length > 0 || byPerson.length > 0;
  return (
    <div data-testid="where-month-went" className="fp-month-card">
      <SectionCard title={`Where ${month} went`}
        action={<CardLink to="/transactions" testId="see-every-transaction">See every transaction</CardLink>}>
        <div className="fp-month-card__figure">
          <span className="fp-month-card__total" style={tabular}>{money(wentOut)}</span>
          {cameIn > 0 && <span className="fp-hint">out of {money(cameIn)} that came in</span>}
        </div>
        {hasSplit ? (
          <ShareBar memberCount={memberCount} byCategory={byCategory} byPerson={byPerson} currency={currency} hideTitle />
        ) : (
          <p className="fp-hint" style={{ margin: 0, fontSize: 14 }}>Nothing has gone out yet this month.</p>
        )}
      </SectionCard>
    </div>
  );
};

/* ── Your skills, compact ─────────────────────────────────────────────────────────────────────────────────────── */

/** The marks a skill holds, as chip words, in the order the Learn page lists them; none means not started. */
export const skillChipWords = (s: SkillProgress): string[] =>
  TRAIL_MARKS.filter(({ key }) => s.marks[key]).map(({ label }) => label);

export const SkillsCompactCard: React.FC<{ skills: SkillProgress[]; thisWeekSkill?: string | null }> = ({ skills, thisWeekSkill }) => {
  const started = skills.filter((s) => skillChipWords(s).length > 0);
  const toStart = skills.length - started.length;
  return (
    <div data-testid="skills-compact" className="fp-skills-compact">
      <SectionCard title="Your skills">
        <ul className="fp-skills-compact__list">
          {started.map((s) => {
            const held = Boolean(thisWeekSkill) && s.id === thisWeekSkill;
            return (
              <li key={s.id} data-testid="skill-chip-row" data-skill={s.id}>
                <span className={held ? 'fp-skills-compact__name is-held' : 'fp-skills-compact__name'}>
                  {s.title}{held ? ' · This week' : ''}
                </span>
                <span className="fp-skills-compact__chips">
                  {skillChipWords(s).map((w) => <span key={w} className={held ? 'fp-chip fp-chip--strong' : 'fp-chip'}>{w}</span>)}
                </span>
              </li>
            );
          })}
          <li className="fp-skills-compact__more">
            <span className="fp-hint">{toStart > 0 ? `${toStart} more to start` : 'Every skill is started'}</span>
            <CardLink to="/learnpal" testId="skills-see-all">See all {skills.length === 6 ? 'six' : skills.length}</CardLink>
          </li>
        </ul>
      </SectionCard>
    </div>
  );
};

/* ── Budgets ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface BudgetLine {
  id: number | string;
  name: string;
  spent: number;
  amount: number;
  /** The server says a pace mark can be read for this row (a monthly, month-to-month budget). */
  paceApplies: boolean;
}

/** The budget rows the overview already sends (expense groups, then unsorted), highest share used first. */
export function budgetLines(overview: BudgetOverview | null, take = 3): BudgetLine[] {
  if (!overview) return [];
  const rows = [
    ...(overview.groups ?? []).flatMap((g) => g.budgets ?? []),
    ...(overview.unsorted?.budgets ?? []),
  ] as unknown as Array<Record<string, unknown>>;
  const lines = rows.map((r) => {
    const category = r.category as { name?: string } | null | undefined;
    return {
      id: r.id as number,
      name: String(category?.name ?? r.category_name ?? r.name ?? ''),
      spent: Math.abs(Number(r.spent ?? 0)),
      amount: Number((r.month_amount ?? r.amount) || 0),
      paceApplies: r.pace_applies === true,
    };
  }).filter((l) => l.amount > 0);
  return lines.sort((a, b) => b.spent / b.amount - a.spent / a.amount).slice(0, take);
}

/* Rust only for over the plan (warmth over alarm); the words carry it too ("$X of $Y"). */
const barColour = (spent: number, amount: number) =>
  spent >= amount ? 'var(--status-over)' : spent / amount >= 0.8 ? 'var(--accent-yellow)' : 'var(--accent-green)';

export const BudgetsCard: React.FC<{ lines: BudgetLine[]; pace?: BudgetPace | null; currency: string }> = ({ lines, pace, currency }) => {
  const money = (n: number) => formatMoney(n, { currency });
  const anyPace = Boolean(pace) && lines.some((l) => l.paceApplies);
  return (
    <div data-testid="budgets-card">
      <SectionCard title="Budgets" action={<CardLink to="/budgets">View all</CardLink>}>
        {lines.length === 0 ? (
          <p className="fp-hint" style={{ margin: 0 }}>No budgets yet. Start with one category you'd like to keep an eye on.</p>
        ) : (
          <ul className="fp-dash-bars">
            {lines.map((l, i) => (
              <li key={l.id}>
                <div className="fp-dash-bars__head">
                  <span translate="no">{l.name}</span>
                  <span className="fp-hint" style={tabular}>{money(l.spent)} of {money(l.amount)}</span>
                </div>
                <div className="fp-dash-bars__track">
                  <Fill value={l.spent / l.amount} index={i} colour={barColour(l.spent, l.amount)} testId="budget-fill" />
                  {pace && l.paceApplies && (
                    <i className="fp-dash-bars__pace fp-mark-in" data-testid="pace-mark" aria-hidden="true"
                      style={staggerStyle(i, { left: `${Math.min(100, pace.fraction * 100)}%` })} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {anyPace && pace && (
          <p className="fp-hint" data-testid="pace-note" style={{ margin: '14px 0 0', fontSize: 13 }}>
            The line is where you would be by day {pace.day}.
          </p>
        )}
      </SectionCard>
    </div>
  );
};

/* ── Accounts ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface AccountLine { id: number | string; name: string; balance: number; currency: string | null; type: string }

const ACCOUNT_ICON: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>> = {
  checking: Landmark, savings: PiggyBank, credit: CreditCard, investment: LineChart, loan: Receipt, cash: Banknote,
};
const ACCOUNT_TYPE: Record<string, string> = {
  checking: 'Checking', savings: 'Savings', credit: 'Credit card', investment: 'Investment', loan: 'Loan', cash: 'Cash',
};

export const AccountsCard: React.FC<{ accounts: AccountLine[]; currency: string }> = ({ accounts, currency }) => (
  <div data-testid="accounts-card">
    <SectionCard title="Accounts" action={<CardLink to="/accounts">View all</CardLink>}>
      {accounts.length === 0 ? (
        <p className="fp-hint" style={{ margin: 0 }}>No accounts to show here. Add one on the Accounts page to start.</p>
      ) : (
        <ul className="fp-dash-accounts">
          {accounts.map((a) => {
            const Icon = ACCOUNT_ICON[a.type] ?? Wallet;
            return (
              <li key={a.id}>
                <span className="fp-dash-accounts__icon"><Icon size={18} strokeWidth={1.75} aria-hidden={true} /></span>
                <span className="fp-dash-accounts__name">
                  <span translate="no">{a.name}</span>
                  <span className="fp-hint" style={{ fontSize: 12 }}>{ACCOUNT_TYPE[a.type] ?? 'Other'}</span>
                </span>
                {/* The sign is the fact (U+2212); a balance owed also wears the debt colour (rust only for debt). */}
                <span className="fp-dash-accounts__balance" data-owed={a.balance < 0 ? 'true' : undefined}
                  style={{ ...tabular, color: a.balance < 0 ? 'var(--status-over)' : 'var(--text-primary)' }}>
                  {a.balance < 0 ? '−' : ''}{formatMoney(Math.abs(a.balance), { currency: a.currency || currency })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  </div>
);

/* ── Goals ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Unfinished goals first (in the API's order), then finished ones; at most `take`. */
export const goalLines = (goals: Goal[], take = 3): Goal[] =>
  [...goals.filter((g) => (g.progress ?? 0) < 1), ...goals.filter((g) => (g.progress ?? 0) >= 1)].slice(0, take);

export const GoalsCard: React.FC<{ goals: Goal[]; currency: string }> = ({ goals, currency }) => {
  const money = (n: number) => formatMoney(n, { currency });
  return (
    <div data-testid="goals-card">
      <SectionCard title="Goals" action={<CardLink to="/goals">View all</CardLink>}>
        {goals.length === 0 ? (
          <p className="fp-hint" style={{ margin: 0 }}>No goals yet. Name one thing you're saving for, and finPal will track it with you.</p>
        ) : (
          <ul className="fp-dash-bars">
            {goals.map((g, i) => {
              const f = goalFigures(g, money);
              const debt = g.direction === 'paydown';
              const colour = debt ? 'var(--peak-cost)' : 'var(--accent-green)';
              return (
                <li key={g.id} data-testid="goal-line" data-direction={g.direction}>
                  <div className="fp-dash-bars__head">
                    <span translate="no">{g.name}</span>
                    <span className="fp-hint" style={tabular}>{[f.primary, f.separator, f.secondary].filter(Boolean).join(' ')}</span>
                  </div>
                  <div className={debt ? 'fp-dash-bars__track is-debt' : 'fp-dash-bars__track'}>
                    <Fill value={goalProgress(g)} index={i} colour={colour} testId="goal-fill" extra={{ 'data-colour': colour }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};
