/**
 * One quiet "Why?" card at the top of Budgets, Goals and Accounts (the debt screen in core).
 *
 *   the sentence  ·  "Why it matters (1 min)" opens the lesson panel  ·  the action
 *
 * The card has no dismiss: "Not now" lives inside the lesson. The action just goes to its page; the
 * outcome is only recorded from inside the lesson. A fetch error renders nothing, never an error box on
 * a money screen. Core edition: literal English, no motion.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { learnpalService } from './service';
import { ShortLessonPanel } from './ShortLessonPanel';
import type { WhyCard as WhyCardData } from '../../types/learnpal';

export interface WhyCardProps {
  screen: 'budgets' | 'goals' | 'debt';
}

export const WhyCard: React.FC<WhyCardProps> = ({ screen }) => {
  const navigate = useNavigate();
  const [card, setCard] = useState<WhyCardData | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    let live = true;
    learnpalService.getWhy(screen)
      .then((r) => { if (live) setCard(r.enabled && r.cards.length > 0 ? r.cards[0] : null); })
      .catch(() => { if (live) setCard(null); });
    return () => { live = false; };
  }, [screen]);

  useEffect(() => load(), [load]);

  // The panel stays mounted while a lesson is open, even if a refetch removes the card.
  if (!card && open === null) return null;

  return (
    <>
      {card && (
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
      <ShortLessonPanel shortId={open} onClose={() => { setOpen(null); load(); }} onFinished={() => load()} />
    </>
  );
};

export default WhyCard;
