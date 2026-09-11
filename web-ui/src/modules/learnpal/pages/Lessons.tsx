import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GearIcon } from '../../../components/GearIcon';
import { SlidePanel } from '../../../components/SlidePanel';
import { pageContainerStyle, pageMaxWidthStyle } from '../../../styles/layoutStyles';
import { learnpalService } from '../service';
import { apiErrorMessage } from '../../../utils/apiError';
import type { LessonDetail, LessonRow } from '../../../types/learnpal';

/**
 * Every lesson — the "place where they can see all the lessons".
 *
 * *** A LOCKED LESSON IS SHOWN, NOT HIDDEN. *** Knowing a lesson exists is the
 * point of this screen: it is what the user is working towards. The server
 * answers 200 with no body for a locked one rather than 403, so the title is
 * always available and only the prose is withheld.
 *
 * *** "NO BODY YET" IS A REAL STATE AND IS SAID PLAINLY. *** Eleven approved
 * lessons are not seeded and four are deliberately unwritten (they are
 * jurisdiction-bound), so a lesson can be earned and still have nothing to
 * read. Offering a reader that opens onto blank space would look broken.
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
  const [counts, setCounts] = useState<{ read: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LessonDetail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await learnpalService.getLessons();
      setRows(data?.lessons ?? null);
      setCounts(data ? { read: data.read, total: data.total } : null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the lessons.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openLesson = async (row: LessonRow) => {
    setOpening(row.slug);
    try {
      setOpen(await learnpalService.getLesson(row.slug));
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not open that lesson.'));
    } finally {
      setOpening(null);
    }
  };

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
        <h1 className="page-title">Lessons</h1>
        <p className="fp-hint">learnPal is not enabled on this instance.</p>
      </div>
    );
  }

  return (
    <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
      <div style={{ marginBottom: 18 }}>
        <h1 className="page-title">Lessons</h1>
        <p className="fp-hint">
          {counts ? `${counts.read} of ${counts.total} read.` : null}{' '}
          A lesson opens when your own figures make it relevant — not on a
          schedule, and never because you clicked something.
        </p>
      </div>

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
            {row.earned && row.has_body && (
              <button
                type="button"
                style={linkButtonStyle}
                onClick={() => void openLesson(row)}
                disabled={opening === row.slug}
              >
                {opening === row.slug ? 'Opening…' : 'Read'}
              </button>
            )}
          </div>
        ))}
      </div>

      <SlidePanel
        isOpen={open !== null}
        onClose={() => setOpen(null)}
        title={open?.title ?? 'Lesson'}
      >
        {/* Rendered as pre-wrapped text rather than parsed markdown: adding a
            markdown renderer is its own decision with its own sanitisation
            question, and the drafts are prose with paragraphs rather than
            tables or embeds. Recorded rather than done in passing. */}
        <div style={{
          whiteSpace: 'pre-wrap', color: 'var(--text-primary)',
          fontSize: 14, lineHeight: 1.6,
        }}>
          {open?.body_md ?? 'Nothing written for this one yet.'}
        </div>
      </SlidePanel>
    </div>
  );
};

export default Lessons;
