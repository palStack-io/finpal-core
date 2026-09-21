import React, { useEffect, useState } from 'react';
import { goalService, type DebtPlan } from '../../services/goalService';
import { formatMoney } from '../../styles/money';
import type { Account } from '../../services/accountService';

/**
 * Choosing which debt to clear first — a step in creating a payoff goal.
 *
 * *** IT WAS A PANEL PARKED ON THE GOALS PAGE AND IT COST TOO MUCH ROOM. ***
 * Owner, 2026-09-20: the advice panels *"need to show only when a user is
 * trying to create a goal"*. Which is also where they make more sense — the
 * ordering question arrives when you decide to pay something off, not every
 * time you glance at your goals.
 *
 * *** THE LESSON IS OFFERED, NOT REQUIRED. *** Owner decision, same day.
 * finPal has never withheld a user's own money from them, and a form that
 * refuses to submit until you have read something is a nag with a lock on it.
 * `Create goal` stays enabled whether or not a method is picked.
 *
 * *** THE ORDER IS NEVER DERIVED HERE. *** Sorting client-side would be a
 * second computation of a figure the server already owns (`order_debts`) —
 * D-101. The ordering appears only once the server has sent one.
 */
export const DebtMethodStep: React.FC<{
  accounts: Account[];
  currency: string;
  onOpenLesson?: () => void;
}> = ({ accounts, currency, onOpenLesson }) => {
  const [plan, setPlan] = useState<DebtPlan | null | 'loading'>('loading');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    goalService.getDebtPlan()
      .then((p) => {
        if (!live) return;
        setPlan(p);
        if (p?.monthly_amount != null) setAmount(String(p.monthly_amount));
      })
      .catch(() => { if (live) setPlan(null); });
    return () => { live = false; };
  }, []);

  const save = async (
    method: 'avalanche' | 'snowball', monthlyAmount?: number,
  ) => {
    setSaving(true);
    setError(null);
    try {
      /* `setDebtPlan` re-reads: the PUT answers with the method and the
         amount only, and the ordering comes from the GET. */
      setPlan(await goalService.setDebtPlan(method, monthlyAmount));
    } catch {
      setError('That did not save. Your plan is unchanged.');
    } finally {
      setSaving(false);
    }
  };

  const debts = accounts.filter(
    (a) => a.account_type === 'credit' || a.account_type === 'loan');
  /* *** NO DEBT ACCOUNT, NOTHING TO PLAN. *** Somebody can still pick "Debt
     paydown" and track a goal by hand — the plan is about ACCOUNTS finPal can
     watch, and a picker over an empty set is a control with nothing behind
     it. The goal itself saves either way. */
  if (plan === 'loading' || debts.length === 0) return null;

  const current = plan?.method ?? null;
  const money = (n: number) =>
    formatMoney(n, { currency: plan?.currency_code ?? currency });

  /* *** WITH ONE DEBT THE ORDERING QUESTION DOES NOT EXIST. *** "Pay this one
     first because it costs the most" says nothing about a single card. The
     monthly amount still does, so the radios go and the rest stays. */
  const ordering = debts.length > 1;

  const methodButton = (
    value: 'avalanche' | 'snowball', title: string, blurb: string,
  ) => (
    <button
      type="button" role="radio" aria-checked={current === value}
      data-testid={`debt-method-${value}`} disabled={saving}
      onClick={() => save(value)}
      style={{
        flex: '1 1 210px', textAlign: 'left', padding: '10px 12px',
        borderRadius: 10, cursor: saving ? 'default' : 'pointer',
        background: 'transparent',
        /* D-269: never colour alone. `aria-checked` for a screen reader, the
           tick for everyone else, the border third. */
        border: `${current === value ? 2 : 1}px solid ${
          current === value ? 'var(--g-ink)' : 'var(--border-light)'}`,
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>
        {current === value ? '✓ ' : ''}{title}
      </div>
      <div className="fp-hint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
        {blurb}
      </div>
    </button>
  );

  return (
    <section
      data-testid="debt-method-step"
      style={{
        padding: '14px 16px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-light)', borderRadius: 10,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>
        {ordering ? 'Which one first?' : 'What you mean to pay'}
      </h3>
      <p className="fp-hint" style={{ margin: '4px 0 10px', lineHeight: 1.55 }}>
        {ordering
          ? `You are carrying ${debts.length} debts. There are two well-known `
            + 'ways to choose the order, they are good at different things, and '
            + 'finPal is not going to pick for you.'
          : 'Say what you mean to put at this each month and finPal will tell '
            + 'you how the month is going against it. It will not tell you off.'}
      </p>

      {ordering ? (
        <>
          <div role="radiogroup" aria-label="How to order your debts"
               style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {methodButton('avalanche', 'Highest rate first',
              'Costs the least overall. Can feel like nothing is happening for a long time.')}
            {methodButton('snowball', 'Smallest balance first',
              'Costs a little more. Finishes things, which is not a trivial benefit.')}
          </div>
          {onOpenLesson ? (
            <button
              type="button" data-testid="debt-open-lesson" onClick={onOpenLesson}
              style={{
                marginTop: 10, padding: 0, border: 0, background: 'transparent',
                color: 'var(--g-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Read the lesson on both →
            </button>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--re-ink)' }}>{error}</p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10,
                    alignItems: 'flex-end', marginTop: 12 }}>
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="debt-monthly" className="fp-hint" style={{ fontSize: 12.5 }}>
            What you mean to put at this a month
          </label>
          <input id="debt-monthly" className="fp-input" inputMode="decimal"
                 value={amount} disabled={saving}
                 onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button
          type="button" data-testid="debt-amount-save"
          disabled={saving || !(Number(amount) > 0)}
          /* `avalanche` when nothing is chosen and there is one debt: the two
             orderings of a single debt are identical, so this is not finPal
             choosing on anybody's behalf. */
          onClick={() => save(current ?? 'avalanche', Number(amount))}
          style={{
            padding: '9px 15px', borderRadius: 8,
            border: '1px solid var(--border-medium)', background: 'transparent',
            color: 'var(--g-ink)', fontSize: 13, fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save plan'}
        </button>
      </div>

      {plan?.order && plan.order.length > 0 ? (
        <ol data-testid="debt-order" style={{ margin: '12px 0 0', paddingLeft: 20 }}>
          {plan.order.map((d) => (
            <li key={d.id} data-testid={`debt-order-${d.id}`}
                style={{ marginBottom: 3, fontSize: 13 }}>
              <strong>{d.name}</strong>{' '}
              <span className="fp-hint">
                {money(Math.abs(d.balance))}
                {/* A missing APR is said, not guessed as zero — and it is why
                    that debt sorts last under avalanche. */}
                {d.apr == null ? ' · rate not recorded' : ` · ${d.apr}%`}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="fp-hint" style={{ margin: '10px 0 0', fontSize: 12.5 }}>
        You can skip this and set it later — the goal will save either way.
      </p>
    </section>
  );
};
