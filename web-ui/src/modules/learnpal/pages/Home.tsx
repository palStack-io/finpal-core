import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { MountainSilhouette } from '../../../components/MountainSilhouette';
import { GearIcon } from '../../../components/GearIcon';
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

/** `read of total`, with the bar underneath. No percentage in the figure: a
 *  fraction says how much is LEFT, which a percentage does not. */
const Counter: React.FC<{
  eyebrow: string; read: number; total: number; note?: string;
}> = ({ eyebrow, read, total, note }) => (
  <div style={{ ...cardStyle, flex: 1, minWidth: 190 }}>
    <div style={eyebrowStyle}>{eyebrow}</div>
    <div style={{ ...figureStyle, marginTop: 6 }}>
      {read} <span style={{ fontSize: 18, color: 'var(--text-secondary)' }}>of {total}</span>
    </div>
    <div
      aria-hidden="true"
      style={{
        marginTop: 10, height: 6, borderRadius: 3,
        background: 'var(--surface-hover)', overflow: 'hidden',
      }}
    >
      {/* `data-testid` so a test can assert the WIDTH rather than the absence of
          the string "NaN". `width: 'NaN%'` is an invalid CSS value, so the DOM
          drops it silently and `innerHTML` never contains it — an assertion on
          the markup passes with the bug present, which is exactly what a
          sabotage found here. */}
      <div data-testid="counter-bar" style={{
        // `total` can be 0 on an instance whose seeder has not run, and 0/0
        // must draw an empty bar rather than `NaN%` — which is what an
        // investments fixture shipped eight times over (D-107).
        width: total > 0 ? `${Math.min(100, (read / total) * 100)}%` : '0%',
        height: '100%', background: 'var(--peak-build)',
      }} />
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
        <div style={eyebrowStyle}>Highest you have reached</div>
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
        <div style={eyebrowStyle}>Highest you have reached</div>
        <div style={{ ...figureStyle, marginTop: 6, fontSize: 24 }}>
          {highest.mountain.name}
        </div>
        <div style={mutedStyle}>
          {highest.mountain.elevation_m.toLocaleString()} m · band{' '}
          {highest.band + 1} of {highest.band_total}
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

const RecentRow: React.FC<{ row: StatsRecent }> = ({ row }) => (
  <li style={{
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
    borderTop: '1px solid var(--border-light)',
  }}>
    <span style={{ lineHeight: 0, marginTop: 2 }}>
      <GearIcon slug={row.gear_slug ?? row.slug} size={20} />
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
      </div>
    </div>
  </li>
);

const NextRow: React.FC<{ row: StatsNext }> = ({ row }) => (
  <li style={{
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0',
    borderTop: '1px solid var(--border-light)',
  }}>
    <span style={{ lineHeight: 0, marginTop: 2, opacity: 0.3 }}>
      <GearIcon slug={row.gear_slug ?? row.slug} size={20} />
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
        <h1 className="page-title">learnPal</h1>
        <p className="fp-hint">learnPal is not enabled on this instance.</p>
      </div>
    );
  }

  return (
    <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title">learnPal</h1>
        <p className="fp-hint">
          Lessons unlocked by your own figures rather than by a schedule, and the
          mountains your goals turned out to be.
        </p>
      </div>

      {error && <div role="alert" style={{ color: 'var(--danger-text)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Counter
          eyebrow="Lessons read"
          read={stats.lessons.read}
          total={stats.lessons.total}
          note={stats.lessons.without_body > 0
            ? `${stats.lessons.without_body} have no write-up yet`
            : undefined}
        />
        <Counter
          eyebrow="Gear earned"
          read={stats.gear.earned}
          total={stats.gear.total}
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
              {stats.recent.map((row) => <RecentRow key={row.slug} row={row} />)}
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
