import React, { useCallback, useEffect, useState } from 'react';
import { PageHead } from '../../../components/PageHead';
import { Link } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { MountainSilhouette } from '../../../components/MountainSilhouette';
import { BadgeIcon } from '../../../components/BadgeIcon';
import { useLessonReader, type LessonReaderApi } from '../LessonReader';
import { pageContainerStyle, pageMaxWidthStyle } from '../../../styles/layoutStyles';
import { learnpalService } from '../service';
import { apiErrorMessage } from '../../../utils/apiError';
import type { LearnStats, StatsNext, StatsRecent } from '../../../types/learnpal';

/**
 * learnPal's home — what you have learned, the hardest you have climbed, and
 * what is next.
 *
 * *** `/learnpal` USED TO BE THE RANGE, WHICH IS A PICTURE AND NOT A
 * PROGRESSION. *** The range answers "how big are my goals"; this answers "what
 * have I got, and what do I do next", which is the question the owner asked for
 * a surface for. The range now lives at `/learnpal/range` and is linked from
 * here.
 *
 * *** THERE IS NO POINTS TILE, AND IT IS ABSENT ON PURPOSE. *** Owner decision
 * 2026-09-11: learnPal has no points at all — no ledger, no column, no table.
 * Points are meant to come from ANSWERING and no quiz exists yet, so a points
 * tile would read **0 for ever with no way to move it**. Every figure on this
 * page is a count of rows that exist.
 *
 * *** AND NO PROSE IS INVENTED HERE. *** A mountain's fact and summit note are
 * seeded content a human approved; a lesson with `has_body: false` is offered
 * as a title with no reader rather than described; and "why it is locked" comes
 * from the server, which returns `null` rather than guessing.
 */

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-light)',
  borderRadius: 16,
  background: 'var(--bg-secondary)',
  padding: '18px 20px',
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
};

const figureStyle: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 700,
  lineHeight: 1.05,
  color: 'var(--text-primary)',
  fontFamily: "'Bricolage Grotesque', sans-serif",
};

const mutedStyle: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' };

/* *** `var(--g-ink)` AND NEVER A BARE `<Link>`. *** This app has no global
   `a { }` rule, so an unstyled link inherits the browser's `#0000ee` and
   measures **1.72:1** on the dark card — an AA failure the contrast walk found
   on 2026-09-11. `--g-ink` is theme-aware and measures 6.92 / 8.21. */
const linkStyle: React.CSSProperties = { color: 'var(--g-ink)', fontSize: 13 };

/** A bare count. *** NO DENOMINATOR AND NO BAR — DESIGN DECISION 5. ***
 *
 *  This rendered `16 of 19` with a progress bar under it until 2026-09-14, on
 *  two cards. Nobody chose 19; finPal did. A rising count is momentum, and
 *  "16 of 19" is a report card — and the difference is the whole voice of the
 *  product. The only progress bar finPal may draw is one whose target the user
 *  picked themselves, which is why the gear shop has one and this does not. */
const Tally: React.FC<{
  eyebrow: string; read: number; note?: string;
}> = ({ eyebrow, read, note }) => (
  <div style={{ ...cardStyle, flex: 1, minWidth: 190 }}>
    <div style={eyebrowStyle}>{eyebrow}</div>
    <div style={{ ...figureStyle, marginTop: 6 }}>
      {read}
    </div>
    {note && <div style={{ ...mutedStyle, marginTop: 8 }}>{note}</div>}
  </div>
);

const HighestCard: React.FC<{ stats: LearnStats }> = ({ stats }) => {
  const highest = stats.highest;

  // *** NO BAND IS NOT BAND ZERO. *** A user with no goals, or only goals on
  // cards with no stated rate, has climbed nothing — and answering "Table
  // Mountain" for them is the molehill the whole design refuses to draw.
  if (!highest || !highest.mountain) {
    return (
      <div style={{ ...cardStyle, flex: 2, minWidth: 260 }}>
        <div style={eyebrowStyle}>The hardest this ever got</div>
        <div style={{ ...figureStyle, marginTop: 6, fontSize: 20 }}>Nothing yet</div>
        <p style={{ ...mutedStyle, marginTop: 8 }}>
          A goal is drawn as a mountain, sized by what it asks of you.{' '}
          <Link to="/goals" style={linkStyle}>Add one</Link> and the hardest you
          ever face is recorded here.
        </p>
      </div>
    );
  }

  const finished = highest.goal_status !== 'active';
  return (
    <div
      data-testid="learnpal-highest"
      style={{ ...cardStyle, flex: 2, minWidth: 260, display: 'flex', gap: 18 }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {/* *** "THE HARDEST THIS EVER GOT", NOT "HIGHEST YOU HAVE REACHED".
            *** `hardest_band` is computed from `peak_magnitude` and never reads
            progress, so a brand-new goal with a $100,000 target and nothing
            saved comes back as Everest — proven. The FIGURE is right and
            useful; the old heading told somebody who had done nothing that they
            had reached the top of the world. This is what the column actually
            means, and what the mountain's own summit note already says. */}
        <div style={eyebrowStyle}>The hardest this ever got</div>
        <div style={{ ...figureStyle, marginTop: 6, fontSize: 24 }}>
          {highest.mountain.name}
        </div>
        <div style={mutedStyle}>
          {highest.mountain.elevation_m.toLocaleString()} m
        </div>
        <p style={{ ...mutedStyle, marginTop: 10 }}>
          {/* *** "SINCE FINISHED" RATHER THAN IMPLYING IT IS STILL UNDER WAY.
              *** This figure deliberately includes archived and achieved goals,
              because a lifetime statistic that falls when somebody tidies up is
              the one thing it must never do. */}
          On <strong style={{ color: 'var(--text-primary)' }}>{highest.goal_name}</strong>
          {finished ? ', a goal you have since finished' : ''}.
        </p>
        {highest.mountain.fact && (
          <p style={{ ...mutedStyle, marginTop: 8, fontStyle: 'italic' }}>
            {highest.mountain.fact}
          </p>
        )}
      </div>
      {/* Decorative: the name, the elevation and the band all say it in text. */}
      <div
        aria-hidden="true"
        style={{ display: 'flex', alignItems: 'flex-end', width: 96 }}
      >
        <MountainSilhouette
          band={highest.band}
          height={100}
          scale="cost"
          fit="width"
          maxPixelHeight={96}
        />
      </div>
    </div>
  );
};

/**
 * *** THESE ROWS WERE NOT CLICKABLE AND THEY SHOULD ALWAYS HAVE BEEN. ***
 * Owner, 2026-09-16: *"on learnpal, i cant seem to click on my recently
 * finished lessons. we should be able to do that"*. They were plain `<li>`s
 * with a gear icon and two lines of text — the one list on the app that names
 * lessons you have EARNED, with no way to read any of them, while `Lessons`
 * had a working reader one file away.
 *
 * The row itself is the trigger rather than a "Read" button on the end, because
 * this list is short and every row in it is already yours: a button would be a
 * second thing to aim at for an action the whole row means. `Lessons` keeps its
 * button, because there a row can be LOCKED and the button is what distinguishes
 * the ones you can open.
 *
 * *** A ROW WITH NO WRITE-UP IS NOT A TRIGGER, AND THAT IS NOT AN OVERSIGHT. ***
 * Eleven approved drafts are unseeded and four lessons are deliberately
 * unwritten, so an earned lesson with nothing to read is expected. It still says
 * "no write-up yet" and it renders as a plain `<li>` — a button onto blank space
 * looks broken, which is the same call `Lessons` already made via `has_body`.
 * `reader.canOpen` is that rule, in one place now.
 */
const RecentRow: React.FC<{
  row: StatsRecent;
  reader: LessonReaderApi;
}> = ({ row, reader }) => {
  const openable = reader.canOpen(row);
  const busy = reader.opening === row.slug;

  const body = (
    <>
    <span style={{ lineHeight: 0, marginTop: 2 }}>
      <BadgeIcon slug={row.gear_slug ?? row.slug} size={34} />
    </span>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
        {row.title}
      </div>
      <div style={mutedStyle}>
        {/* *** `goal_name` IS NULLABLE TWICE OVER AND "by None" MUST NEVER
            PRINT. *** A predicate-gated lesson has no goal behind it, and the
            FK is `ondelete='SET NULL'` so a lesson unlocked by a goal the user
            has since deleted keeps the unlock and loses the attribution. */}
        {row.goal_name
          ? <>Unlocked by <strong style={{ color: 'var(--text-primary)' }}>{row.goal_name}</strong></>
          : 'Unlocked'}
        {row.unlocked_at && <> · {new Date(row.unlocked_at).toLocaleDateString()}</>}
        {/* Said plainly rather than hidden: eleven approved drafts are not
            seeded and four are deliberately unwritten, so an earned lesson
            with nothing to read is expected. */}
        {!row.has_body && <> · <em>no write-up yet</em></>}
        {busy && <> · opening…</>}
      </div>
    </div>
    </>
  );

  const shell: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
    borderTop: '1px solid var(--border-light)',
  };

  if (!openable) return <li style={shell}>{body}</li>;

  return (
    <li style={{ ...shell, padding: 0, borderTop: 'none' }}>
      {/* A real `<button>`, not a div with an onClick: this is keyboard
          reachable, it announces itself, and `every-page.spec.ts`'s axe run
          would have caught the alternative. Full width and left-aligned so the
          hit area is the row a reader is already looking at. */}
      <button
        type="button"
        onClick={() => reader.open(row)}
        disabled={busy}
        aria-label={`Read: ${row.title}`}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          width: '100%', padding: '10px 0', textAlign: 'left',
          borderTop: '1px solid var(--border-light)',
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          background: 'transparent',
          cursor: busy ? 'default' : 'pointer',
          font: 'inherit', color: 'inherit',
        }}
      >
        {body}
      </button>
    </li>
  );
};

const NextRow: React.FC<{ row: StatsNext }> = ({ row }) => (
  <li style={{
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
    borderTop: '1px solid var(--border-light)',
  }}>
    <span style={{ lineHeight: 0, marginTop: 2, opacity: 0.3 }}>
      <BadgeIcon slug={row.gear_slug ?? row.slug} size={34} />
    </span>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{
        fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Lock size={13} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} />
        {row.title}
      </div>
      {/* *** THE SERVER RETURNS `null` WHEN IT CANNOT EXPLAIN A LOCK, AND THAT
          IS RENDERED AS NOT KNOWING. *** `checks.check_reason` is fail-closed
          for a `check_type` this build does not implement, exactly as
          `run_check` refuses to unlock one. A plausible sentence about a
          condition nothing tests is worse than saying nothing. */}
      <div style={mutedStyle}>
        {row.reason ?? 'Opens on its own; we cannot say what moves it yet'}
      </div>
    </div>
    {row.goal_progress !== null && (
      <div style={{ ...mutedStyle, whiteSpace: 'nowrap' }}>
        {Math.round(row.goal_progress * 100)}% now
      </div>
    )}
  </li>
);

export const Home: React.FC = () => {
  const [stats, setStats] = useState<LearnStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Shared with `Lessons`, so a lesson opens the same way from either screen
     and the `has_body` rule lives in one place. See `LessonReader`. */
  const reader = useLessonReader();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await learnpalService.getStats());
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load learnPal.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
        <Loader2 size={20} className="animate-spin" aria-label="Loading learnPal" />
      </div>
    );
  }

  // `null` means the module is not installed, which is not an error state.
  if (!stats) {
    return (
      <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
        {/* The module being absent is not an error, and it still gets a
            real head: a bare sentence on an empty page reads as a
            failure rather than as an answer. */}
        <PageHead
          band="learnpal"
          title="learnPal"
          subtitle="learnPal is not enabled on this instance."
        />
      </div>
    );
  }

  return (
    <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
      {/* *** learnPal'S PAGES NOW OPEN THE WAY EVERY OTHER PAGE DOES. ***
          Owner, 2026-09-16: *"can we redesign our pointPal and also the
          learnPal"*. These three were already halfway there — AUDIT D-233
          recorded that they use `className="page-title"` rather than inventing
          their own title scale, which is why they needed no exemption when that
          gate widened to `modules/`. What they did NOT have is the head: a
          hand-rolled `h1` plus `p.fp-hint` in a `marginBottom: 20` wrapper,
          which is the exact shape `PageHead` replaced on eleven core pages.
          Adopting it is a consolidation, not a redesign of anything this module
          decided.

          The `learnpal` band is a STAIRCASE rather than a range — see
          `headBands.ts`. Every other ridge is peaks at whatever heights suit the
          page; this module is about lessons that unlock from your own figures,
          so the ridge steps up in even increments and reads as progress instead
          of scenery. */}
      <PageHead
        band="learnpal"
        title="learnPal"
        subtitle="Lessons unlocked by your own figures rather than by a schedule, and the mountains your goals turned out to be."
      />

      {/* The reader's own failure goes where this page's failures go, rather
          than into a second alert region a screen reader would have to find. */}
      {(error || reader.error) && (
        <div role="alert" style={{ color: 'var(--danger-text)' }}>{error || reader.error}</div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Tally
          eyebrow="Lessons read"
          read={stats.lessons.read}
          note={stats.lessons.without_body > 0
            ? `${stats.lessons.without_body} have no write-up yet`
            : undefined}
        />
        <Tally
          eyebrow="Gear earned"
          read={stats.gear.earned}
        />
        <HighestCard stats={stats} />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        <section
          data-testid="learnpal-recent"
          style={{ ...cardStyle, flex: 1, minWidth: 280 }}
        >
          <h2 style={{ ...eyebrowStyle, margin: 0 }}>Recently finished</h2>
          {stats.recent.length === 0 ? (
            <p style={{ ...mutedStyle, marginTop: 10, fontStyle: 'italic' }}>
              Nothing yet. A lesson opens when your own figures reach it.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {stats.recent.map((row) => (
                <RecentRow key={row.slug} row={row} reader={reader} />
              ))}
            </ul>
          )}
        </section>

        <section
          data-testid="learnpal-next"
          style={{ ...cardStyle, flex: 1, minWidth: 280 }}
        >
          <h2 style={{ ...eyebrowStyle, margin: 0 }}>What is next, and why it is locked</h2>
          {stats.next.length === 0 ? (
            <p style={{ ...mutedStyle, marginTop: 10, fontStyle: 'italic' }}>
              You have everything there is. More lessons are being written.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {stats.next.map((row) => <NextRow key={row.slug} row={row} />)}
            </ul>
          )}
        </section>
      </div>

      {reader.panel}

      <div style={{
        marginTop: 18, display: 'flex', gap: 16, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <Link to="/learnpal/range" style={linkStyle}>See your whole range</Link>
        <Link to="/learnpal/lessons" style={linkStyle}>See all lessons</Link>
      </div>
    </div>
  );
};

export default Home;
