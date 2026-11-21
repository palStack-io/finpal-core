/**
 * A lesson's "Your number" chart in one small bar, for the Why line under a page hero (Budgets C, core, 2026-11-20).
 *
 * Drawn from the lesson's own `try` figures (`GET short/<id>`), so it can never say a different number from the lesson
 * it opens. Only the fixed-share and non-monthly lessons have a compact form; any other kind, or a missing or odd figure,
 * draws nothing and the sentence stands alone. The bar grows once (CSS `.fp-fill`, at rest under reduced motion); the
 * label says the figure in words.
 */
import React from 'react';
import { formatMoney } from '../../styles/money';
import type { ShortTry } from '../../types/learnpal';

/** A finite number from a 2-place string, else null (a missing figure). */
const num = (v: unknown): number | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type CompactModel =
  | { kind: 'fixed_share'; percent: number }
  | { kind: 'sinking'; monthly: number; yearly: number };

/** The figures the compact bar draws, or null when this lesson has no compact form or a figure is missing. Pure. */
export function compactModel(t: ShortTry | null | undefined): CompactModel | null {
  if (!t) return null;
  if (t.kind === 'fixed_share') {
    const percent = num(t.share_percent);
    return percent === null || percent < 0 || percent > 100 ? null : { kind: 'fixed_share', percent: Math.round(percent) };
  }
  if (t.kind === 'sinking') {
    const yearly = num(t.yearly); const monthly = num(t.monthly);
    return yearly === null || monthly === null || yearly <= 0 || monthly <= 0 ? null : { kind: 'sinking', monthly, yearly };
  }
  return null;
}

export const CompactLessonChart: React.FC<{ figures: ShortTry | null; currency: string }> = ({ figures, currency }) => {
  const model = compactModel(figures);
  if (!model) return null;
  const money = (v: number) => formatMoney(v, { currency });
  const share = model.kind === 'fixed_share' ? model.percent / 100 : Math.min(1, model.monthly / model.yearly);
  const name = model.kind === 'fixed_share'
    ? `${model.percent}% of what came in is fixed; ${100 - model.percent}% is still yours to choose`
    : `Twelve months of ${money(model.monthly)} adding up to ${money(model.yearly)}`;
  const label = model.kind === 'fixed_share' ? `Fixed ${model.percent}%` : `${money(model.monthly)} a month`;
  return (
    <span className="fp-why-line__chart" role="img" aria-label={name} data-testid="why-line-chart">
      <span className="fp-why-line__bar" aria-hidden="true">
        <span className="fp-fill" style={{ display: 'block', width: `${share * 100}%`, background: 'var(--kt-seg-1)' }} />
      </span>
      <span className="fp-why-line__figure" aria-hidden="true">{label}</span>
    </span>
  );
};

export default CompactLessonChart;
