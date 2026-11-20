/**
 * One small chart per short lesson, drawn from the `try` figures the server already sends
 * (GET /api/v1/learnpal/short/<id>; shapes in src/modules/learnpal/short_figures.py).
 *
 * *** NO NEW NUMBERS. *** Every bar is one of the server's figures, scaled against another of them. A
 * figure that is missing or not a number means no chart at all (the lesson's sentence still reads), never
 * a bar drawn from a guess. Honest figures stay honest (voice rule 9): nothing starts part-filled, nothing
 * rounds a share to whole cells, nothing is scaled past its bar.
 *
 * One visual grammar: product green (`--g-ink`) for what is yours, rust (`--lp-rust`) only for interest
 * and debt, ink labels, no gridlines, one line of text instead of a legend. Each chart is one image with
 * an accessible name that states its figures; the parts inside are hidden from assistive tech.
 *
 * Core edition: no motion. Nothing here transitions or animates.
 */
import React from 'react';
import { formatMoney } from '../../styles/money';
import type { DebtCompare, DebtMethodResult, ShortTry } from '../../types/learnpal';

type Interest = Extract<ShortTry, { kind: 'interest' }>;

/** A finite number from a 2-place string, else null (a missing figure). */
const num = (v: unknown): number | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pct = (part: number, whole: number): string =>
  `${whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0}%`;

const frame: React.CSSProperties = {
  border: '1px solid var(--border-light)', borderRadius: 12, padding: 14, margin: '4px 0 12px',
  display: 'flex', flexDirection: 'column', gap: 10,
};
const caption: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 };
const legend: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px 12px',
  fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums',
};
const track: React.CSSProperties = {
  display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: 'var(--border-light)',
};
const GREEN = 'var(--g-ink)';
const RUST = 'var(--lp-rust)';
/* The second green: the same ink, lighter, so the two greens never need a legend to tell apart. */
const SOFT: React.CSSProperties = { background: GREEN, opacity: 0.45 };

const Frame: React.FC<{ title: string; label: string; testId?: string; children: React.ReactNode }> = (
  { title, label, testId = 'lesson-chart', children },
) => (
  <div style={frame} data-testid={testId}>
    <p style={caption}>{title}</p>
    <div role="img" aria-label={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {children}
    </div>
  </div>
);

const Legend: React.FC<{ left: string; right?: string }> = ({ left, right }) => (
  <div style={legend} aria-hidden="true"><span>{left}</span>{right && <span>{right}</span>}</div>
);

// ------------------------------------------------------------------ per lesson

const MonthChart: React.FC<{ t: Extract<ShortTry, { kind: 'month' }>; money: (n: number) => string }> = (
  { t, money },
) => {
  const income = num(t.income);
  const spent = num(t.spent);
  const big = num(t.biggest_amount);
  if (income === null || spent === null || big === null || income <= 0 || spent < 0 || big < 0) return null;
  const top = Math.min(big, spent);
  // More out than in: the bar is what went out, so no part runs past it.
  const scale = Math.max(income, spent);
  return (
    <Frame title="What came in, and what went out"
      label={`${money(income)} came in. ${money(spent)} went out, and ${t.biggest_category} was the biggest at ${money(big)}.`}>
      <div style={track} aria-hidden="true">
        <span data-part="biggest" style={{ width: pct(top, scale), background: GREEN }} />
        <span data-part="rest-out" style={{ width: pct(spent - top, scale), ...SOFT }} />
      </div>
      <Legend left={`${t.biggest_category} ${money(big)}`} right={`Out ${money(spent)} of ${money(income)}`} />
    </Frame>
  );
};

const FixedShareChart: React.FC<{ t: Extract<ShortTry, { kind: 'fixed_share' }> }> = ({ t }) => {
  const share = num(t.share_percent);
  if (share === null || share < 0 || share > 100) return null;
  const rest = 100 - share;
  return (
    <Frame title="How much of what came in is already decided"
      label={`Fixed ${share}% of what came in. Still yours to choose ${rest}%.`}>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 4 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} style={{ height: 18, borderRadius: 3, background: 'var(--border-light)', overflow: 'hidden' }}>
            {/* A cell can be part-filled: 38% is 3.8 cells, never rounded up to 4. */}
            <span data-part="cell-fill" style={{
              display: 'block', height: '100%', background: GREEN,
              width: `${Math.round(Math.min(1, Math.max(0, share / 10 - i)) * 100)}%`,
            }} />
          </span>
        ))}
      </div>
      <div style={legend} aria-hidden="true">
        <span>{`Fixed ${share}%`}</span><span>{`Still yours to choose ${rest}%`}</span>
      </div>
    </Frame>
  );
};

const SinkingChart: React.FC<{ t: Extract<ShortTry, { kind: 'sinking' }>; money: (n: number) => string }> = (
  { t, money },
) => {
  const yearly = num(t.yearly);
  const monthly = num(t.monthly);
  if (yearly === null || monthly === null || yearly <= 0 || monthly <= 0) return null;
  return (
    <Frame title="A little each month, ready when the bill comes"
      label={`Twelve months of ${money(monthly)} add up to ${money(yearly)} for ${t.item}.`}>
      <div aria-hidden="true" style={{
        display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 4, alignItems: 'end', height: 70,
      }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} data-part="step" style={{
            height: `${Math.round(((i + 1) / 12) * 1000) / 10}%`, borderRadius: 3,
            ...(i === 11 ? { background: GREEN } : SOFT),
          }} />
        ))}
      </div>
      <Legend left={`${money(monthly)} a month`} right={`${money(yearly)} ready when the bill comes`} />
    </Frame>
  );
};

const BufferChart: React.FC<{ t: Extract<ShortTry, { kind: 'buffer' }>; money: (n: number) => string }> = (
  { t, money },
) => {
  const held = num(t.held);
  const first = num(t.buffer_amount);
  const targets = (t.targets ?? []).map((x) => ({ months: x.months, target: num(x.target) }));
  if (held === null || first === null || held < 0 || first <= 0 || targets.some((x) => x.target === null)) return null;
  const marks = [
    { label: 'A first cushion', value: first },
    ...targets.map((x) => ({ label: `${x.months} months`, value: x.target as number })),
  ];
  const scale = Math.max(held, ...marks.map((m) => m.value));
  const named = [
    `A first cushion is ${money(first)}`,
    ...targets.map((x) => `${x.months} months of essentials is ${money(x.target as number)}`),
  ].join('; ');
  return (
    <Frame title="Where a first cushion sits" label={`You hold ${money(held)}. ${named}.`}>
      <div aria-hidden="true" style={{ position: 'relative', height: 26 }}>
        <span style={{ ...track, position: 'absolute', left: 0, right: 0, top: 8, height: 10, borderRadius: 5 }}>
          <span data-part="held" style={{ width: pct(held, scale), background: GREEN }} />
        </span>
        {marks.map((m) => (
          <span key={m.label} data-part="tick" style={{
            position: 'absolute', top: 2, height: 22, width: 2, background: 'var(--text-primary)',
            left: pct(m.value, scale), marginLeft: -1,
          }} />
        ))}
      </div>
      {/* The figures as a list below the line, so labels never collide in a narrow panel. */}
      <ul aria-hidden="true" style={{ ...legend, listStyle: 'none', margin: 0, padding: 0 }}>
        {marks.map((m) => <li key={m.label}>{`${m.label} ${money(m.value)}`}</li>)}
        <li style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{`You hold ${money(held)}`}</li>
      </ul>
    </Frame>
  );
};

const InterestSplit: React.FC<{ t: Interest; money: (n: number) => string }> = ({ t, money }) => {
  const interest = num(t.interest_month);
  const payment = num(t.base_payment);
  if (interest === null || payment === null || interest < 0 || payment <= 0) return null;
  const covers = t.covers_interest && interest < payment;
  if (!covers) {
    return (
      <Frame title={`Where a ${money(payment)} payment goes`}
        label={`All of a ${money(payment)} payment goes to interest; none comes off the balance yet.`}>
        <div style={{ ...track, height: 30 }} aria-hidden="true">
          <span data-part="interest" style={{ width: '100%', background: RUST }} />
        </div>
        <Legend left="Interest, charged first" right="Nothing off the balance yet" />
      </Frame>
    );
  }
  const off = payment - interest;
  return (
    <Frame title={`Where a ${money(payment)} payment goes`}
      label={`${money(interest)} of a ${money(payment)} payment goes to interest, ${money(off)} off the balance.`}>
      <div style={{ ...track, height: 30 }} aria-hidden="true">
        <span data-part="interest" style={{ width: pct(interest, payment), background: RUST }} />
        <span data-part="principal" style={{ width: pct(off, payment), background: GREEN }} />
      </div>
      <div style={legend} aria-hidden="true">
        <span>Interest, charged first</span><span>Off the balance</span>
      </div>
      <Legend left={money(interest)} right={money(off)} />
    </Frame>
  );
};

/** One method as drawn: never, or its months (in the server's words) and its interest. */
type Method = { never: true; first: string } | { never: false; first: string; months: number; span: string; interest: number };
const clears = (m: Method): m is Extract<Method, { never: false }> => m.never === false;

function method(r: DebtMethodResult | undefined, names: string[]): Method | null {
  if (!r || typeof r.first !== 'string' || !names.includes(r.first)) return null;
  if (r.never === true) return { never: true, first: r.first };
  const months = num(r.months); const interest = num(r.interest_total);
  if (r.never !== false || months === null || !Number.isInteger(months) || months <= 0) return null;
  if (interest === null || interest < 0 || typeof r.span !== 'string' || !r.span) return null;
  return { never: false, first: r.first, months, span: r.span, interest };
}

type Compared = { basis: 'plan' | 'minimums'; monthly: number; rate: Method; size: Method };

/** The comparison as drawn, or null when anything is missing or out of range (then the balances chart stands). */
function compared(c: DebtCompare | undefined, names: string[]): Compared | null {
  if (!c || (c.basis !== 'plan' && c.basis !== 'minimums')) return null;
  const monthly = num(c.monthly);
  const rate = method(c.avalanche, names); const size = method(c.snowball, names);
  if (monthly === null || monthly <= 0 || !rate || !size) return null;
  return { basis: c.basis, monthly, rate, size };
}

/**
 * Both methods on the person's own monthly amount (`try.compare`, the server's `debt_comparison`): two bars each,
 * months to debt-free (green) and the interest on the way (rust), each scaled to the larger of the two methods. A
 * method that never clears says so and draws no bar.
 */
const DebtCompareChart: React.FC<{ c: Compared; money: (n: number) => string }> = ({ c, money }) => {
  const { rate, size, monthly } = c;
  const rows = [{ name: 'Highest rate first', m: rate }, { name: 'Smallest balance first', m: size }];
  const done = rows.map((r) => r.m).filter(clears);
  const mostMonths = Math.max(1, ...done.map((m) => m.months));
  const mostInterest = Math.max(0, ...done.map((m) => m.interest));
  const sentence = (name: string, m: Method) => (clears(m)
    ? `${name}: debt-free in ${m.span}, ${money(m.interest)} interest`
    : `${name}: at this amount, the payments don't get ahead of the interest yet`);
  const basis = `Paying ${money(monthly)} a month, ${c.basis === 'plan' ? 'your plan' : 'your minimums'}`;
  const label = `${[...rows.map((r) => sentence(r.name, r.m)), basis].join('. ')}.`;
  return (
    <Frame title="Two ways to pay it down, on your numbers" label={label}>
      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(({ name, m }) => (
          <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{sentence(name, m)}</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{`Starts with ${m.first}`}</span>
            {clears(m) && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '6px 12px', alignItems: 'center',
                fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums',
              }}>
                <span>Debt-free in</span>
                <div style={{ ...track, height: 10, background: 'transparent' }}>
                  <span data-part="months" style={{ width: pct(m.months, mostMonths), background: GREEN }} />
                </div>
                <span style={{ textAlign: 'right' }}>{m.span}</span>
                <span>Interest</span>
                <div style={{ ...track, height: 10, background: 'transparent' }}>
                  <span data-part="interest-total" style={{ width: pct(m.interest, mostInterest), background: RUST }} />
                </div>
                <span style={{ textAlign: 'right' }}>{money(m.interest)}</span>
              </div>
            )}
          </div>
        ))}
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{basis}</span>
      </div>
    </Frame>
  );
};

const DebtOrderChart: React.FC<{ t: Extract<ShortTry, { kind: 'debt_order' }>; money: (n: number) => string }> = (
  { t, money },
) => {
  const debts = (t.debts ?? []).map((d) => ({ name: d.name, apr: d.apr, balance: num(d.balance) }));
  if (debts.length < 2 || debts.some((d) => d.balance === null || d.balance < 0)) return null;
  const both = compared(t.compare, debts.map((d) => d.name));
  if (both) return <DebtCompareChart c={both} money={money} />;
  const scale = Math.max(...debts.map((d) => d.balance as number));
  const { highest_rate: highest, smallest } = t;
  const start = (name: string): string | null => {
    if (highest && smallest && highest === smallest) return name === highest ? 'Both ways start here' : null;
    if (name === highest) return 'Highest rate first starts here';
    if (name === smallest) return 'Smallest balance first starts here';
    return null;
  };
  const listed = debts.map((d) => `${d.name}, ${money(d.balance as number)} at ${d.apr}%.`).join(' ');
  const starts = highest && smallest
    ? (highest === smallest
      ? ` Highest rate first and smallest balance first both start with ${highest}.`
      : ` Highest rate first starts with ${highest}. Smallest balance first starts with ${smallest}.`)
    : '';
  return (
    <Frame title="What you owe, and where each way starts" label={`${listed}${starts}`}>
      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {debts.map((d) => {
          const tag = start(d.name);
          return (
            <div key={d.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={legend}>
                <span style={{ color: 'var(--text-primary)' }}>{`${d.name}, ${d.apr}%`}</span>
                <span>{money(d.balance as number)}</span>
              </div>
              <div style={{ ...track, height: 12, borderRadius: 6 }}>
                <span data-part="debt" style={{ width: pct(d.balance as number, scale), background: RUST }} />
              </div>
              {tag && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-ink)' }}>{tag}</span>}
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

/** The chart for a lesson's "Your number" step, or null when its figures are missing. */
export const LessonChart: React.FC<{ t: ShortTry; currency: string }> = ({ t, currency }) => {
  const money = (n: number) => formatMoney(n, { currency });
  switch (t.kind) {
    case 'month': return <MonthChart t={t} money={money} />;
    case 'fixed_share': return <FixedShareChart t={t} />;
    case 'sinking': return <SinkingChart t={t} money={money} />;
    case 'buffer': return <BufferChart t={t} money={money} />;
    case 'interest': return <InterestSplit t={t} money={money} />;
    case 'debt_order': return <DebtOrderChart t={t} money={money} />;
    default: return null;
  }
};

/** The extras the months-to-clear bars show: the payment as it is, then +10, +20 and +40. */
const SHOWN_EXTRAS = [0, 10, 20, 40];

/**
 * The "try" step's months-to-clear bars for the interest lesson, from the server's slider `points`.
 * A payment that never clears (months null) is left out, never drawn as a made-up length.
 */
export const MonthsToClear: React.FC<{ t: Interest; currency: string }> = ({ t, currency }) => {
  const money = (n: number) => formatMoney(n, { currency });
  const base = num(t.base_payment);
  const rows = SHOWN_EXTRAS
    .map((extra) => (t.points ?? []).find((p) => p.extra === extra))
    .filter((p): p is NonNullable<typeof p> => !!p && typeof p.months === 'number' && p.months > 0);
  if (base === null || rows.length < 2) return null;
  const longest = Math.max(...rows.map((p) => p.months as number));
  const name = (extra: number) => (extra === 0 ? `${money(base)} a month` : `${money(extra)} more`);
  const label = `Months to clear: ${rows.map((p) => `${name(p.extra)}, ${p.months} months`).join('; ')}.`;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstTotal = num(first.interest_total);
  const lastTotal = num(last.interest_total);
  const at = (extra: number) => (extra === 0 ? `at ${money(base)}` : `with ${money(extra)} more`);
  return (
    <div style={frame} data-testid="months-to-clear">
      <p style={caption}>Pay a little more, clear it sooner</p>
      <div role="img" aria-label={label} style={{
        display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '8px 12px', alignItems: 'center',
        fontSize: 13, fontVariantNumeric: 'tabular-nums',
      }}>
        {rows.map((p, i) => (
          <React.Fragment key={p.extra}>
            <span aria-hidden="true">{p.extra === 0 ? money(base) : `+${money(p.extra)}`}</span>
            <span aria-hidden="true" style={{ height: 12, borderRadius: 6, background: 'var(--border-light)', overflow: 'hidden' }}>
              <span data-part="months" style={{
                display: 'block', height: '100%', width: `${(p.months as number) / longest * 100}%`,
                background: GREEN, opacity: 0.4 + (0.6 * i) / Math.max(1, rows.length - 1),
              }} />
            </span>
            <span aria-hidden="true" style={{ textAlign: 'right' }}>{`${p.months} months`}</span>
          </React.Fragment>
        ))}
      </div>
      {firstTotal !== null && lastTotal !== null && (
        <p style={{ ...legend, margin: 0, display: 'block' }}>
          {`Interest over the whole time: ${money(firstTotal)} ${at(first.extra)}, ${money(lastTotal)} ${at(last.extra)}.`}
        </p>
      )}
    </div>
  );
};

export default LessonChart;
