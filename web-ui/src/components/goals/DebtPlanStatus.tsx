import React, { useEffect, useState } from 'react';
import { goalService, type DebtPlan } from '../../services/goalService';
import { formatMoney } from '../../styles/money';

/**
 * How this month is going against the paydown plan — on the goal's own card.
 *
 * *** IT LIVES BESIDE THE THING IT DESCRIBES, NOT IN A PANEL AT THE TOP OF
 * THE PAGE. *** Owner decision, 2026-09-20. The picker moved into the create
 * flow, and if the status had gone with it the plan would have become
 * write-once: `plan_status` exists precisely so that *"every week we tell
 * them how they are doing"* has somewhere to be read.
 *
 * *** "BEHIND" IS STATED AND NOTHING IS OFFERED. *** Owner decision,
 * 2026-09-19. The person who is behind is usually behind because they could
 * not pay, and a prompt they cannot act on is a reminder that they are
 * failing. The figure is the message.
 *
 * *** AND THE BASIS IS PRINTED, BECAUSE A ZERO MEANS "NOT OBSERVED". ***
 * `paid_toward_debt` counts transfers recorded against a debt account, so
 * somebody paying their card from a bank finPal cannot see scores zero and
 * reads as behind. Saying so is the difference between a figure and a scold.
 */
export const DebtPlanStatus: React.FC<{
  currency: string;
  onChangePlan?: () => void;
}> = ({ currency, onChangePlan }) => {
  const [plan, setPlan] = useState<DebtPlan | null | 'loading'>('loading');

  useEffect(() => {
    let live = true;
    goalService.getDebtPlan()
      .then((p) => { if (live) setPlan(p); })
      .catch(() => { if (live) setPlan(null); });
    return () => { live = false; };
  }, []);

  if (plan === 'loading' || plan === null) return null;
  const status = plan.status ?? null;
  const money = (n: number) =>
    formatMoney(n, { currency: plan.currency_code ?? currency });
  const methodLabel = plan.method === 'snowball'
    ? 'Smallest balance first' : 'Highest rate first';

  return (
    <div
      data-testid="debt-plan-status"
      style={{
        marginTop: 12, paddingTop: 10,
        borderTop: '1px solid var(--border-light)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline',
      }}
    >
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          <span className="fp-hint" style={{ fontWeight: 500 }}>{methodLabel}</span>
          {status ? (
            <>
              {' · '}
              {/* D-269: the WORD carries it, not the colour. And `--*-ink` are
                  the text tokens; `--status-*` are fills that fail AA here. */}
              <span style={{ color: status.state === 'behind'
                ? 'var(--re-ink)' : 'var(--g-ink)' }}>
                {status.state === 'ahead'
                  && `Ahead by ${money(status.difference)} this month`}
                {status.state === 'on' && 'On plan this month'}
                {status.state === 'behind'
                  && `Behind by ${money(-status.difference)} this month`}
              </span>
            </>
          ) : null}
        </div>
        {status ? (
          <p className="fp-hint" style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.5 }}>
            {money(status.paid)} of {money(status.planned)}, counted from
            transfers recorded against these accounts. Paying from a bank
            finPal does not hold does not show up here.
          </p>
        ) : (
          /* *** NO AMOUNT MEANS NOTHING TO MEASURE AGAINST, AND THAT IS SAID
             RATHER THAN LEFT BLANK. *** An ordering with no monthly figure is
             a plan half made, and the reader is the only one who can finish
             it. */
          <p className="fp-hint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
            No monthly amount set, so there is nothing to measure this month
            against.
          </p>
        )}
      </div>
      {onChangePlan ? (
        <button
          type="button" data-testid="debt-change-plan" onClick={onChangePlan}
          style={{
            padding: 0, border: 0, background: 'transparent',
            color: 'var(--g-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Change plan →
        </button>
      ) : null}
    </div>
  );
};
