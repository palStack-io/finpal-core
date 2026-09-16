/**
 * The shell every pre-auth screen sits in: a range on the left, the form on the
 * right.
 *
 * *** THESE FIVE SCREENS WERE THE ONLY PLACE IN finPal THAT DID NOT LOOK LIKE
 * finPal. *** Goals are mountains, the dashboard opens on a range, a goal card
 * carries its own peak — and then Login, Register, ForgotPassword,
 * ResetPassword and OidcCallback were plain cards on a gradient with nothing of
 * the product on them. They are the first thing every user sees and the last
 * thing anyone scoped. Drawn in `docs/mockups/auth-web.html`.
 *
 * *** THE ART IS IMPORTED, NOT COPIED. *** `RANGE_SILHOUETTES` is the app's own
 * geometry table and this file reads `[1]` and `[0]` out of it. A `d` attribute
 * pasted in here would be a `d` attribute that drifts from the range the
 * dashboard draws, and then the two surfaces would disagree about what Ben
 * Nevis looks like. The trail, the marker and the cloud below ARE new geometry
 * — they have no upstream, they exist only for these screens, and they are
 * therefore defined here ONCE and keyed by state, rather than per page.
 *
 * *** AND THE ART IS FIXED, IDENTICAL FOR EVERY VISITOR. *** The climber
 * partway up a slope implies progress, and at the sign-in screen finPal does
 * not know who you are — it cannot know whether you have goals or how far up
 * any of them you are. So this is decoration and must stay decoration.
 * Decoration that looks like data is the exact shape of D-102, where a caption
 * told users their net worth rose 43% while the line fell. If the peaks are
 * ever driven by a real figure, they stop being allowed on a signed-out page.
 *
 * *** DARK IN BOTH THEMES, AND HARDCODED ON PURPOSE. *** Every pre-auth page
 * paints `#0E1711 → #16241A` regardless of `data-theme`, and
 * `authPagesUseBrandColours.test.ts` asserts that they use no CSS variables:
 * `var(--text-secondary)` resolves to the LIGHT value for a light-mode reader
 * and puts 3.00:1 text on a background that never changed. This file is in that
 * test's page list for the same reason. Making the auth flow theme-aware is a
 * design decision with ~240 substitutions behind it, not a colour fix, and it
 * is deliberately not what this shell does.
 */

import type { ReactNode } from 'react';
import { RANGE_SILHOUETTES, type RangeSilhouette } from '../../utils/rangeSilhouettes';

/**
 * Which state of the same range a screen shows. The state IS the message, so
 * every screen gets its own and no two share one by accident.
 */
export type AuthArt =
  /** Register — an unclimbed range. No trail, no climber: nothing has started. */
  | 'unclimbed'
  /** Login — a dashed trail and a climber partway up. You left partway. */
  | 'partway'
  /** ForgotPassword — the trail stops at a marker and fades. The way in is lost. */
  | 'lost'
  /** ResetPassword — the same trail, continuous again. The previous screen's completion. */
  | 'rejoined'
  /** OidcCallback — weather over the summit. The range is unharmed; the route is not available. */
  | 'clouded';

/* ── geometry that has no upstream ──────────────────────────────────────────
 * On the same `0 0 100 100` box `RANGE_SILHOUETTES` uses, so these sit in the
 * peak's own coordinate space and move with it. y=100 is the ground.
 */

/** The full climb: valley floor to just under the summit. */
const TRAIL = 'M14,98 C26,92 30,78 38,66 C44,56 48,46 52,38';
/** The first third of it, which is as far as `lost` gets. */
const TRAIL_STUB = 'M14,98 C22,94 26,88 30,82';
/** The rest of it, drawn far fainter and wider-dashed: present, not followable. */
const TRAIL_FADED = 'M33,78 C37,72 41,66 45,58';
/** A marker standing where the trail stops. */
const MARKER_POST = 'M30,84 L30,74';
const MARKER_FLAG = 'M30,75 L37,77 L30,79 Z';
/** Cloud across the summit — it covers the route, it does not damage the mountain. */
const CLOUD = 'M28,30 Q40,18 54,24 Q66,14 78,26 Q92,24 92,34 L20,34 Q20,26 28,30 Z';

/** Where the climber is, in the peak's coordinates — a point ON `TRAIL`. */
const CLIMBER = { x: 38, y: 66 };

/* ── colour, measured ──────────────────────────────────────────────────────
 * Ratios against the art panel's darkest surface `#1B3024`, computed rather
 * than eyeballed: INK 14.05:1, SOFT 6.28:1, KICK 10.00:1. Neither browser walk
 * captures a signed-out page, so these were measured by hand — the same way the
 * Settings rail tags were — and they are pinned in
 * `authShellArtIsImported.test.ts` so a future palette edit has to re-measure.
 */
const INK = '#ffffff';
const SOFT = '#9CB3A3';
const KICK = '#86efac';
/** Brand dark. The peaks are decorative, so these carry opacity, not contrast. */
const PEAK = '#166534';
const PEAK_SHADE = '#0f4a26';

interface PeakProps {
  peak: RangeSilhouette;
  /** `translate(x,y) scale(sx,sy)` in the 200x104 outer box. */
  transform: string;
  bodyOpacity: number;
  shadeOpacity: number;
  children?: ReactNode;
}

/**
 * One silhouette from the shared table, plus whatever this screen draws on it.
 *
 * `snow` is rendered only when the silhouette HAS snow — Table Mountain has
 * none, because its flat top is its identity, and drawing a cap on it would
 * make it a different mountain.
 */
function Peak({ peak, transform, bodyOpacity, shadeOpacity, children }: PeakProps) {
  return (
    <g transform={transform}>
      <path d={peak.body} fill={PEAK} opacity={bodyOpacity} />
      {peak.shade && <path d={peak.shade} fill={PEAK_SHADE} opacity={shadeOpacity} />}
      {peak.snow && (
        <path d={peak.snow} fill={INK} opacity={(peak.snowOpacity ?? 0.5) * 0.46} />
      )}
      {children}
    </g>
  );
}

/**
 * The range for one state.
 *
 * `preserveAspectRatio="none"` is deliberate and is the one place this file
 * departs from the dashboard's rule about never distorting a path: here the
 * peaks are a background band whose width is the panel's and whose height is
 * fixed, and a uniformly-scaled range would either overflow a narrow panel or
 * leave a gap in a wide one. They read as a horizon, not as a measurement.
 */
function RangeArt({ state }: { state: AuthArt }) {
  const near = RANGE_SILHOUETTES[1];  // Ben Nevis — one summit, a light cap
  const far = RANGE_SILHOUETTES[0];   // Table Mountain — the flat-topped backdrop
  const dimmed = state === 'clouded';

  return (
    <svg viewBox="0 0 200 104" preserveAspectRatio="none" aria-hidden="true">
      <Peak
        peak={near}
        transform="translate(90,4) scale(1.06,1)"
        bodyOpacity={dimmed ? 0.22 : 0.3}
        shadeOpacity={dimmed ? 0.18 : 0.26}
      >
        {(state === 'partway' || state === 'rejoined') && (
          <path
            d={TRAIL}
            fill="none"
            stroke={PEAK_SHADE}
            strokeWidth={1.6}
            strokeDasharray="3 3"
            opacity={state === 'rejoined' ? 0.62 : 0.55}
          />
        )}
        {state === 'partway' && (
          <>
            <circle cx={CLIMBER.x} cy={CLIMBER.y} r={3.1} fill={PEAK} />
            <circle
              cx={CLIMBER.x}
              cy={CLIMBER.y}
              r={5.4}
              fill="none"
              stroke={PEAK}
              strokeWidth={1}
              opacity={0.45}
            />
          </>
        )}
        {state === 'lost' && (
          <>
            <path
              d={TRAIL_STUB}
              fill="none"
              stroke={PEAK_SHADE}
              strokeWidth={1.6}
              strokeDasharray="3 3"
              opacity={0.55}
            />
            <path
              d={TRAIL_FADED}
              fill="none"
              stroke={PEAK_SHADE}
              strokeWidth={1.6}
              strokeDasharray="2 6"
              opacity={0.22}
            />
            <path d={MARKER_POST} stroke={PEAK} strokeWidth={1.4} />
            <path d={MARKER_FLAG} fill={PEAK} />
          </>
        )}
        {dimmed && <path d={CLOUD} fill={INK} opacity={0.55} />}
      </Peak>
      {/* The far peak is dropped on the two shortest panels rather than
          squeezed: at 330px tall a second range crowds the copy it sits under. */}
      {(state === 'unclimbed' || state === 'partway') && (
        <Peak
          peak={far}
          transform={
            state === 'unclimbed'
              ? 'translate(6,26) scale(.78,.74)'
              : 'translate(2,30) scale(.74,.70)'
          }
          bodyOpacity={state === 'unclimbed' ? 0.2 : 0.18}
          shadeOpacity={0.18}
        />
      )}
    </svg>
  );
}

export interface AuthShellProps {
  art: AuthArt;
  /** The small uppercase line above the headline. */
  kicker: string;
  /**
   * The art panel's own sentence.
   *
   * *** NOT A HEADING ELEMENT. *** It is rendered as a `<p>` so it cannot
   * compete with the form's `h1` for the page's heading outline; `every-page`
   * asserts exactly one `h1` per route and a second one here would be a real
   * skip for anyone navigating by headings. The form owns the `h1`.
   */
  headline: string;
  blurb: string;
  /** The form column. Whatever the page already rendered goes in here. */
  children: ReactNode;
  /** A hint the art panel drops below the fold on the shortest screens. */
  short?: boolean;
}

export default function AuthShell({
  art,
  kicker,
  headline,
  blurb,
  children,
  short = false,
}: AuthShellProps) {
  return (
    <div
      className="auth-split"
      style={{
        background: '#16241A',
        border: '1px solid rgba(134, 239, 172, 0.16)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
        minHeight: short ? '22rem' : '27rem',
      }}
    >
      <div
        className="auth-split-art"
        style={{ background: 'linear-gradient(176deg, #12211A 0%, #16281D 62%, #1B3024 100%)' }}
      >
        <span
          style={{
            fontSize: '0.656rem',
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: KICK,
          }}
        >
          {kicker}
        </span>
        <p
          style={{
            margin: '0.5rem 0 0.375rem',
            fontSize: '1.4375rem',
            fontWeight: 800,
            letterSpacing: '-0.012em',
            lineHeight: 1.16,
            maxWidth: '16ch',
            color: INK,
          }}
        >
          {headline}
        </p>
        <p style={{ margin: 0, fontSize: '0.8125rem', maxWidth: '30ch', color: SOFT }}>
          {blurb}
        </p>
        <RangeArt state={art} />
      </div>
      <div className="auth-split-form">{children}</div>
    </div>
  );
}
