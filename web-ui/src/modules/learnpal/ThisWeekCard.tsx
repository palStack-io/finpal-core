/**
 * "This week" on the Dashboard: two columns, one sentence to understand and one thing to do.
 *
 *   This week: understand this          Do this
 *   the sentence + "Why it matters"     [action]   Not now
 *
 * The first heading names the held week ("This week, Nov 16 – 22: understand this"): the server keeps one lesson
 * Monday to Sunday unless it is taken or set aside, so the dates say why it has not changed since yesterday.
 * "Not now" is recorded on the server (`not_now`) and hides the card. A fetch error or a person who
 * turned learning off renders nothing. Core edition: literal English, no motion. Stacks under 640px.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import type { SlotState } from '../../components/home/DashboardSlot';
import { learnpalService } from './service';
import { ShortLessonPanel } from './ShortLessonPanel';
import type { WhyCard } from '../../types/learnpal';

export interface ThisWeekState {
  lesson: WhyCard | null;
  /** The week the lesson is held for, as the server sent it. */
  week?: { start: string; end: string };
  state: SlotState;
  hide: () => void;
}

export function useThisWeek(): ThisWeekState {
  const [lesson, setLesson] = useState<WhyCard | null>(null);
  const [week, setWeek] = useState<{ start: string; end: string } | undefined>(undefined);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let live = true;
    learnpalService.getThisWeek()
      .then((r) => { if (live) { setLesson(r.enabled ? r.lesson : null); setWeek(r.week); } })
      .catch(() => { /* no card beats an error box on a money screen */ })
      .finally(() => { if (live) setSettled(true); });
    return () => { live = false; };
  }, []);

  const hide = useCallback(() => setLesson(null), []);
  return { lesson, week, hide, state: !settled ? 'loading' : lesson ? 'show' : 'hide' };
}

/**
 * "Nov 16 – 22" / "16–22 nov": the held week in the person's language. Hand-built (the phone's twin, which cannot
 * rely on Intl's formatRange under Hermes) so every browser and the phone print the same thing. The dates are
 * calendar days ("YYYY-MM-DD"); languages without a month list here use English.
 */
const MONTHS: Record<string, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
};

const parse = (iso: string): { m: number; d: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  return m >= 0 && m < 12 && d >= 1 && d <= 31 ? { m, d } : null;
};

export function weekRange(start: string, end: string, lang = 'en'): string {
  const a = parse(start);
  const b = parse(end);
  if (!a || !b) return '';
  if (lang === 'es') {
    const months = MONTHS.es;
    return a.m === b.m ? `${a.d}–${b.d} ${months[a.m]}` : `${a.d} ${months[a.m]} – ${b.d} ${months[b.m]}`;
  }
  const months = MONTHS.en;
  return a.m === b.m ? `${months[a.m]} ${a.d} – ${b.d}` : `${months[a.m]} ${a.d} – ${months[b.m]} ${b.d}`;
}

const heading: React.CSSProperties = {
  margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
};
const linkButton: React.CSSProperties = {
  marginTop: 6, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'underline',
};

export const ThisWeekCard: React.FC<{ week: ThisWeekState }> = ({ week }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const { lesson, hide } = week;
  // The dates keep a lesson held all week from looking stale ("This week, Nov 16 – 22: understand this").
  const range = week.week ? weekRange(week.week.start, week.week.end) : '';

  const notNow = () => {
    if (!lesson) return;
    // The card goes either way; a failed post just means it may come back next visit.
    learnpalService.finishShortLesson(lesson.id, 'not_now').catch(() => undefined);
    hide();
  };

  if (!lesson && open === null) return null;

  return (
    <>
      {lesson && (
        <section data-testid="this-week-card" aria-label="This week" className="fp-this-week" style={{
          margin: '16px 0 20px',
          padding: '16px 20px', borderRadius: 12,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-light)',
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={heading} data-testid="this-week-heading">
              {range ? `This week, ${range}: understand this` : 'This week: understand this'}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.5 }}>{lesson.card}</p>
            <button type="button" data-testid="this-week-open" onClick={() => setOpen(lesson.id)}
              style={linkButton}>Why it matters (1 min)</button>
          </div>
          <div style={{ minWidth: 0 }}>
            <h2 style={heading}>Do this</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <Button data-testid="this-week-action" onClick={() => navigate(lesson.action.href)}>
                {lesson.action.label}
              </Button>
              <button type="button" data-testid="this-week-not-now" onClick={notNow} style={{
                padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 14,
              }}>Not now</button>
            </div>
          </div>
        </section>
      )}
      <ShortLessonPanel shortId={open} onClose={() => setOpen(null)} />
    </>
  );
};

export default ThisWeekCard;
