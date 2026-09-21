import React, { useCallback, useEffect, useState } from 'react';
import { PageHead } from '../../../components/PageHead';
import { Loader2 } from 'lucide-react';
import { GearIcon } from '../../../components/GearIcon';
import { useLessonReader } from '../LessonReader';
import { pageContainerStyle, pageMaxWidthStyle } from '../../../styles/layoutStyles';
import { learnpalService } from '../service';
import { apiErrorMessage } from '../../../utils/apiError';
import type { LessonRow } from '../../../types/learnpal';

/**
 * Every lesson — the "place where they can see all the lessons".
 *
 * *** A LOCKED LESSON IS SHOWN, NOT HIDDEN. *** Knowing a lesson exists is the
 * point of this screen: it is what the user is working towards. The server
 * answers 200 with no body for a locked one rather than 403, so the title is
 * always available and only the prose is withheld.
 *
 * *** "NO BODY YET" IS A REAL STATE AND IS SAID PLAINLY. *** Since C1d all
 * nineteen seeded lessons carry their approved prose, so on a booted stack
 * every earned row offers a reader -- but the state stays, because a milestone
 * can ship ahead of its write-up and four lessons remain deliberately unwritten
 * (they are jurisdiction-bound). Offering a reader onto blank space would look
 * broken, so `has_body` still decides whether the button appears.
 */

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 14px', borderRadius: 12,
  border: '1px solid var(--border-light)',
  background: 'var(--bg-secondary)',
};

const mutedStyle: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' };

/* Matches `Goals.tsx`'s own link-button. *** DELIBERATELY AN INLINE STYLE AND
   NOT A CLASS: *** my first version named a class that does not exist, and a
   class with no rule renders silently unstyled -- D-60.
   `cssClassesAreDefined.test.ts` caught it by name.
   It then caught the name a SECOND time, sitting in this very comment: the gate
   scans source text, so quoting the bad class while explaining it re-trips it.
   Worth knowing before writing a comment about a class name. */
const linkButtonStyle: React.CSSProperties = {
  padding: 0, background: 'none', border: 'none', color: 'var(--g-ink)',
  cursor: 'pointer', fontSize: '13px', textDecoration: 'underline',
};

export const Lessons: React.FC = () => {
  const [rows, setRows] = useState<LessonRow[] | null>(null);
  /* *** A COUNT, NOT A FRACTION (decision 5). *** This held `{read, total}` and
     the page printed "0 of 19". Nobody chose 19 — finPal did. Found on
     2026-09-14 by the e2e no-denominator walk, which was the SEVENTH instance:
     the other six had already been fixed by reading the components, and this
     one survived because nobody thought to look at this page. */
  const [counts, setCounts] = useState<{ read: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* The reader is shared with `Home`, which lists recently-finished lessons and
     could not open any of them until 2026-09-16. See `LessonReader`. */
  const reader = useLessonReader();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await learnpalService.getLessons();
      setRows(data?.lessons ?? null);
      setCounts(data ? { read: data.read } : null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the lessons.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);


  if (loading) {
    return (
      <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
        <Loader2 size={20} className="animate-spin" aria-label="Loading lessons" />
      </div>
    );
  }

  if (!rows) {
    return (
      <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
        {/* The module being absent is not an error, and it still gets a real
            head: a bare sentence on an empty page reads as a failure rather
            than as an answer. */}
        <PageHead
          band="learnpal"
          title="Lessons"
          subtitle="learnPal is not enabled on this instance."
        />
      </div>
    );
  }

  return (
    <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
      {/* *** learnPal'S PAGES NOW OPEN THE WAY EVERY OTHER PAGE DOES. ***
          Owner, 2026-09-16: *"can we redesign our pointPal and also the
          learnPal"*. AUDIT D-233 recorded that these three already use
          `className="page-title"` rather than inventing their own title scale;
          what they lacked is the head — a hand-rolled `h1` plus `p.fp-hint` in a
          margin wrapper, the exact shape `PageHead` replaced on eleven core
          pages.

          *** THE SUBTITLE STAYS JSX HERE, AND THAT IS WHY `subtitle` IS A
          ReactNode. *** This one carries a live count, so flattening it to a
          template string would freeze "0 lessons read" into the markup. The
          other two learnPal pages pass plain strings because they say the same
          thing to everybody. */}
      <PageHead
        band="learnpal"
        title="Lessons"
        subtitle={<>
          {counts
            ? `${counts.read} ${counts.read === 1 ? 'lesson' : 'lessons'} read.`
            : null}{' '}
          A lesson opens when your own figures make it relevant — not on a
          schedule, and never because you clicked something.
        </>}
      />

      {error && <div role="alert" style={{ color: 'var(--danger-text)' }}>{error}</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((row) => (
          <div key={row.slug} style={rowStyle} data-testid={`lesson-${row.slug}`}>
            <span style={{ opacity: row.earned ? 1 : 0.3, lineHeight: 0 }}>
              <GearIcon slug={row.gear_slug ?? row.slug} size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {row.title}
              </div>
              <div style={mutedStyle}>
                {row.earned
                  ? (row.has_body ? 'Yours to read' : 'Earned — no text written yet')
                  : row.unlock_at_progress !== null
                    ? `Opens at ${Math.round(row.unlock_at_progress * 100)}%`
                    : 'Opens when your data makes it relevant'}
              </div>
            </div>
            {/* Only offered when there is something to open: earned AND written. */}
            {row.earned && reader.canOpen(row) && (
              <button
                type="button"
                style={linkButtonStyle}
                onClick={() => reader.open(row)}
                disabled={reader.opening === row.slug}
              >
                {reader.opening === row.slug ? 'Opening…' : 'Read'}
              </button>
            )}
          </div>
        ))}
      </div>

      {reader.panel}
    </div>
  );
};

export default Lessons;
