import React, { useCallback, useEffect, useState } from 'react';
import { goalService, type DebtPlan } from '../../services/goalService';
import type { Account } from '../../services/accountService';
import { formatMoney } from '../../styles/money';

/**
 * Which debt to clear first, how much a month, and how this month is going.
 *
 * *** THE ORDER IS NEVER DERIVED HERE. *** Sorting the accounts client-side
 * would be a second computation of a figure the server already computes
 * (`order_debts`), and two computations of one figure disagree — D-101, hit
 * five times in three days. So the panel shows an ordering only once the
 * server has sent one, and shows the picker alone before that.
 *
 * *** IT PICKS NEITHER METHOD, AND SAYS SO. *** Avalanche costs less and
 * snowball finishes things sooner; which is right depends on whether the
 * reader will keep doing it, which finPal cannot know. Same line the
 * `avalanche-vs-snowball` lesson walks and the same reason `BufferCalculator`
 * offers three months and six and recommends neither.
 *
 * *** "BEHIND" IS STATED AND NOTHING IS OFFERED. *** Owner decision,
 * 2026-09-19. Somebody behind is usually behind because they could not pay,
 * and a prompt they cannot act on is a reminder that they are failing.
 */
export const DebtPlanPanel: React.FC<{
  accounts: Account[];
  currency: string;
}> = ({ accounts, currency }) => {
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

  const save = useCallback(async (
    method: 'avalanche' | 'snowball',
    monthlyAmount?: number,
  ) => {
    setSaving(true);
    setError(null);
    try {
      /* `setDebtPlan` re-reads, because the PUT answers with the method and
         the amount only — the order and the status come from the GET. */
      const fresh = await goalService.setDebtPlan(method, monthlyAmount);
      setPlan(fresh);
    } catch {
      setError('That did not save. Your plan is unchanged.');
    } finally {
      setSaving(false);
    }
  }, []);

  /* *** THE ORDERING QUESTION NEEDS TWO DEBTS; THE PLAN DOES NOT. *** The
     first version hid the whole panel below two, and the deployed demo is what
     showed that to be wrong: its persona carries one card, so nothing rendered
     at all — no monthly amount, no ahead/on/behind, on the exact screen the
     feature was built for. "Which one first" is meaningless about a single
     card; "am I keeping to what I said I would pay" is not. So the radios are
     what disappears below two, not the panel. */
  const debts = accounts.filter(
    (a) => a.account_type === 'credit' || a.account_type === 'loan');
  if (plan === 'loading' || debts.length === 0) return null;
  const ordering = debts.length > 1;

  /* *** THE SERVER'S CODE WINS, BECAUSE IT IS THE ONE IT CONVERTED INTO. ***
     D-278. The `currency` prop is the page's, which is right for a page whose
     figures all come from one account and wrong the moment a household holds
     two currencies. The fallback is for a server older than the key. */
  const money = (n: number) =>
    formatMoney(n, { currency: plan?.currency_code ?? currency });
  const method = plan?.method ?? null;
  const status = plan?.status ?? null;

  const methodButton = (
    value: 'avalanche' | 'snowball', title: string, blurb: string,
  ) => (
    <button
      type="button"
      role="radio"
      aria-checked={method === value}
      data-testid={`debt-method-${value}`}
      disabled={saving}
      onClick={() => save(value)}
      style={{
        flex: '1 1 220px', textAlign: 'left', padding: '11px 13px',
        borderRadius: 10, cursor: saving ? 'default' : 'pointer',
        background: 'transparent',
        /* *** THE SELECTED ONE IS NOT SELECTED BY COLOUR ALONE. *** D-269's
           rule: `aria-checked` carries it for a screen reader and the tick
           carries it for everyone else; the border is the third signal. */
        border: `${method === value ? 2 : 1}px solid ${
          method === value ? 'var(--g-ink)' : 'var(--border-light)'}`,
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {method === value ? '✓ ' : ''}{title}
      </div>
      <div className="fp-hint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
        {blurb}
      </div>
    </button>
  );

  return (
    <section
      data-testid="debt-plan-panel"
      style={{
        padding: '16px 18px', marginBottom: 24,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)', borderRadius: 12,
      }}
    >
      {/* *** h2, NOT h3, AND THE PAGE'S ONLY HEADING ABOVE IT IS THE h1. ***
          `every-page.spec.ts` fails a jump of more than one level, and it
          failed `/goals` in both themes on exactly this: an h3 sitting
          directly under the page title with no h2 anywhere between them. A
          reader tabbing headings hears a level that promises a section that
          does not exist. */}
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
        {ordering ? 'Which one first?' : 'Paying it down'}
      </h2>
      <p className="fp-hint" style={{ margin: '4px 0 12px', lineHeight: 1.55 }}>
        {ordering
          ? `You are carrying ${debts.length} debts. There are two well-known ways `
            + 'to choose the order, they are good at different things, and finPal '
            + 'is not going to pick for you.'
          : 'Say what you mean to put at this each month and finPal will tell you '
            + 'how the month is going against it. It will not tell you off.'}
      </p>

      {ordering && (
        <div
          role="radiogroup"
          aria-label="How to order your debts"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}
        >
          {methodButton('avalanche', 'Highest rate first',
            'Costs the least overall. Can feel like nothing is happening for a long time.')}
          {methodButton('snowball', 'Smallest balance first',
            'Costs a little more. Finishes things, which is not a trivial benefit.')}
        </div>
      )}

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--re-ink)' }}>{error}</p>
      )}

      {/* *** WITH ONE DEBT THERE ARE NO RADIOS, SO THE AMOUNT FIELD MUST SHOW
          BEFORE A PLAN ROW EXISTS. *** Otherwise nothing on the panel can be
          operated: the radios are what creates the row, and they are hidden. */}
      {(plan || !ordering) && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginTop: 16 }}>
            <div style={{ flex: '1 1 200px' }}>
              <label htmlFor="debt-monthly" className="fp-hint" style={{ fontSize: 12.5 }}>
                What you mean to put at this a month
              </label>
              <input
                id="debt-monthly" className="fp-input" inputMode="decimal"
                value={amount} disabled={saving}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <button
              type="button"
              data-testid="debt-amount-save"
              disabled={saving || !(Number(amount) > 0)}
              /* *** `avalanche` WHEN THERE IS NO PLAN YET AND ONE DEBT. ***
                 The server requires a method and the two orderings of a single
                 debt are identical, so this is not finPal choosing on the
                 user's behalf — there is nothing to choose between. The radios
                 appear, unset, the moment a second debt exists. */
              onClick={() => save(plan?.method ?? 'avalanche', Number(amount))}
              style={{
                padding: '9px 15px', borderRadius: 8,
                border: '1px solid var(--border-medium)', background: 'transparent',
                color: 'var(--g-ink)', fontSize: 13, fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {plan?.order && plan.order.length > 0 && (
            <ol data-testid="debt-order" style={{ margin: '16px 0 0', paddingLeft: 20 }}>
              {plan.order!.map((d) => (
                <li key={d.id} data-testid={`debt-order-${d.id}`} style={{ marginBottom: 4, fontSize: 13.5 }}>
                  <strong>{d.name}</strong>{' '}
                  <span className="fp-hint">
                    {money(Math.abs(d.balance))}
                    {/* *** A MISSING APR IS SAID, NOT GUESSED AS ZERO. *** It
                        is also why this one sorts last under avalanche. */}
                    {d.apr == null ? ' · rate not recorded' : ` · ${d.apr}%`}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {status && (
            <div
              data-testid="debt-plan-status"
              style={{
                marginTop: 16, paddingTop: 12,
                borderTop: '1px solid var(--border-light)',
              }}
            >
              {/* *** THE WORD CARRIES IT, NOT THE COLOUR. *** D-269. And the
                  inks are the text tokens; `--status-*` are fills that fail AA
                  against the surfaces this page uses. */}
              <div style={{ fontSize: 14, fontWeight: 600,
                            color: status.state === 'behind' ? 'var(--re-ink)' : 'var(--g-ink)' }}>
                {status.state === 'ahead' && `Ahead by ${money(status.difference)} this month`}
                {status.state === 'on' && 'On plan this month'}
                {status.state === 'behind' && `Behind by ${money(-status.difference)} this month`}
              </div>
              <p className="fp-hint" style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.55 }}>
                {money(status.paid)} of {money(status.planned)}, counted from
                transfers recorded against these accounts. Paying from a bank
                finPal does not hold does not show up here.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
};
