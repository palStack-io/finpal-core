/**
 * One quiet "Why?" card at the top of Budgets, Goals and Accounts (the debt screen in core).
 *
 *   the sentence  ·  "Why it matters (1 min)" opens the lesson panel  ·  the action
 *
 * The card has no dismiss: "Not now" lives inside the lesson. The action just goes to its page; the
 * outcome is only recorded from inside the lesson. A fetch error renders nothing, never an error box on
 * a money screen. Core edition: literal English, CSS motion only.
 *
 * `variant="line"` (Budgets C, 2026-11-20): the same card as ONE compact line under the page hero: label · sentence ·
 * a small bar from the lesson's own `try` figures (`CompactLessonChart`) · "Why it matters (1 min)". No action button.
 * `hidden` keeps the fetch (so `onCards` still reports) but draws nothing, for a page that already shows a lesson
 * elsewhere (at most one lesson at a time).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { learnpalService } from './service';
import { ShortLessonPanel } from './ShortLessonPanel';
import { CompactLessonChart } from './CompactLessonChart';
import type { ShortTry, WhyCard as WhyCardData } from '../../types/learnpal';

export interface WhyCardProps {
  screen: 'budgets' | 'goals' | 'debt';
  variant?: 'card' | 'line';
  /** Currency for the line's small chart when the lesson's figures do not name one. */
  currency?: string;
  /** Every card the server returned for this screen (after each load), for a page that reads more than the first. */
  onCards?: (cards: WhyCardData[]) => void;
  hidden?: boolean;
}

export const WhyCard: React.FC<WhyCardProps> = ({ screen, variant = 'card', currency = 'USD', onCards, hidden = false }) => {
  const navigate = useNavigate();
  const [card, setCard] = useState<WhyCardData | null>(null);
  const [figures, setFigures] = useState<ShortTry | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    let live = true;
    learnpalService.getWhy(screen)
      .then((r) => {
        if (!live) return;
        const cards = r.enabled ? r.cards : [];
        setCard(cards.length > 0 ? cards[0] : null);
        onCards?.(cards);
      })
      .catch(() => { if (live) { setCard(null); onCards?.([]); } });
    return () => { live = false; };
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps -- onCards is read at call time

  useEffect(() => load(), [load]);

  // The line's small chart: the lesson's own figures (`GET short/<id>`, no side effects); a failure means no chart.
  const cardId = card?.id ?? null;
  useEffect(() => {
    if (variant !== 'line' || !cardId) { setFigures(null); return undefined; }
    let live = true;
    learnpalService.getShortLesson(cardId)
      .then((s) => { if (live) setFigures(s.try ?? null); })
      .catch(() => { if (live) setFigures(null); });
    return () => { live = false; };
  }, [variant, cardId]);

  const panel = <ShortLessonPanel shortId={open} onClose={() => { setOpen(null); load(); }} onFinished={() => load()} />;

  if (variant === 'line') {
    const lineCurrency = (figures && 'currency' in figures && figures.currency) || currency;
    return (
      <>
        {card && !hidden && (
          <section className="fp-why-line fp-rise" data-testid="why-line" aria-label="Why this matters">
            <span className="fp-why-line__label">Why this matters</span>
            <p className="fp-why-line__text" translate="no">{card.card}</p>
            <CompactLessonChart figures={figures} currency={lineCurrency} />
            <button type="button" className="fp-why-line__open fp-press" data-testid="why-open" onClick={() => setOpen(card.id)}>
              Why it matters (1 min)
            </button>
          </section>
        )}
        {panel}
      </>
    );
  }

  // The panel stays mounted while a lesson is open, even if a refetch removes the card.
  if (!card && open === null) return null;

  return (
    <>
      {card && !hidden && (
        <section data-testid="why-card" aria-label="Why this matters" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, margin: '16px 0',
          padding: '16px 20px', borderRadius: 12,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
        }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.5 }}>{card.card}</p>
            <button type="button" data-testid="why-open" onClick={() => setOpen(card.id)} style={{
              marginTop: 6, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'underline',
            }}>Why it matters (1 min)</button>
          </div>
          <Button data-testid="why-action" onClick={() => navigate(card.action.href)}>{card.action.label}</Button>
        </section>
      )}
      {panel}
    </>
  );
};

export default WhyCard;
