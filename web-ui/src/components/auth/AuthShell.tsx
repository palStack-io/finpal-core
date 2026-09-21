/**
 * The shell every pre-auth screen sits in: a full-bleed dark page, the copy on
 * the left, the form on the right, and a range along the bottom.
 *
 * *** THE RANGE MOVED FROM A LEFT PANEL TO THE GROUND LINE, AND THAT IS THE
 * WHOLE OF THIS REVISION. *** Drawn in
 * `docs/mockups/entry-pantrypal-treatment-web.html` (§9d) after the owner said
 * they liked pantryPal's index page, *"especially those pantry items at the
 * bottom"*.
 *
 * pantryPal's shelf of jars works because the jars ARE its subject and a shelf
 * IS at the bottom — the product's own object, in the place that object belongs,
 * at a weight that reads as architecture rather than illustration. Translate the
 * TEXTURE and you get finPal with jars on it. Translate the RELATIONSHIP and you
 * get a range along the bottom, which is what these peaks already are everywhere
 * else in the app: the dashboard's `GoalRange`, learnPal's range, a goal card.
 *
 * So the peaks stop being a picture BESIDE the form and become the floor UNDER
 * it. The first version of this shell put them in a `1.05fr` column and that
 * worked; this is better, and the reason is that a range is a horizon and a
 * horizon belongs on a ground line.
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
import { Link } from 'react-router-dom';
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

/* ── the frieze's own layout ───────────────────────────────────────────────
 * One `0 0 1200 170` box, `preserveAspectRatio="none"`, so the horizon stretches
 * to whatever width the page is. y=GROUND is the shelf edge.
 *
 * *** EVERY PEAK'S BASE LANDS ON THE SAME LINE, COMPUTED RATHER THAN NUDGED. ***
 * The mockup's first draft set these transforms by eye, and the taller peaks'
 * bases fell past the bottom of the box and were clipped — which put the ground
 * line UNDER them and made the row look like it was floating in front of the
 * page instead of standing on it. Standing on something is the entire reason
 * pantryPal's shelf works. `translateY` is therefore always
 * `GROUND - 100 * scaleY`, because every silhouette is authored on a 0..100 box.
 */
const FRIEZE_W = 1200;
const FRIEZE_H = 150;
const GROUND = 140;

/** `[x, scaleX, scaleY, band]`, back row then front row. */
type Peak = [number, number, number, number];

/* Two rows, because pantryPal's shelf has jars BEHIND jars and that overlap is
   most of why it reads as depth rather than as a border pattern. A single row of
   evenly spaced peaks reads as a repeating motif. */
const FAR: Peak[] = [
  [-30, 1.15, 0.80, 0], [140, 1.40, 0.94, 1], [340, 1.05, 0.76, 2],
  [520, 1.35, 0.88, 0], [720, 1.20, 0.80, 1], [900, 1.30, 0.90, 2],
  [1080, 1.45, 0.84, 0],
];
const NEAR: Peak[] = [
  [40, 0.95, 0.60, 2], [230, 0.72, 0.52, 0], [420, 1.00, 0.64, 1],
  [620, 0.74, 0.50, 2], [810, 1.00, 0.60, 0], [1000, 0.82, 0.54, 1],
  [1140, 0.92, 0.58, 2],
];

/**
 * The one peak the per-screen state is drawn on.
 *
 * *** THE STATE NEEDS A HOME, AND SPREADING IT ACROSS THE ROW WOULD MAKE IT
 * TEXTURE. *** A trail on every peak is a hatching pattern; a trail up ONE peak
 * is a trail. So the five states — unclimbed, partway, lost, rejoined, clouded —
 * all attach here, in this peak's own 0..100 coordinates, which is why the
 * geometry constants below did not have to change when the layout did.
 *
 * Scaled larger than its neighbours on purpose: it is the peak the eye is meant
 * to read, and at the frieze's near-row scale a dashed trail is illegible.
 */
const FEATURE: Peak = [500, 1.70, 1.28, 1];

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
/*
 * *** THE PAGE GOES DARKER THAN THE OLD AUTH GRADIENT, AND THAT IS WHAT GIVES
 * THE FRIEZE ROOM. *** `#0B120D` against the previous `#0E1711 → #16241A`. A
 * horizon drawn at 22% opacity needs a surface dark enough for 22% to be
 * visible; on the old wash the far row disappeared. Measured on it: #ffffff
 * 18.98:1, #E9F0E6 16.33, #9CB3A3 8.49, #86efac 13.52, #E0B968 10.22 — every
 * text colour on this shell clears AA with room to spare, and the ratios are
 * pinned in `authShellArtIsImported.test.ts`.
 */
const PAGE = '#0B120D';
const PANEL = '#16241A';
/** Brand dark. The peaks are decorative, so these carry opacity, not contrast. */
const PEAK = '#166534';
const PEAK_SHADE = '#0f4a26';
/** The front row, one step lighter so the overlap reads as depth. */
const PEAK_LIT = '#15803d';

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

/** One silhouette placed so its base lands exactly on `GROUND`. */
function placed(peak: Peak) {
  const [x, sx, sy] = peak;
  return `translate(${x},${GROUND - 100 * sy}) scale(${sx},${sy})`;
}

/**
 * The horizon the page stands on, and the per-screen state drawn on one peak.
 *
 * `preserveAspectRatio="none"` is deliberate and is the one place this file
 * departs from the dashboard's rule about never distorting a silhouette: here
 * the peaks are a horizon whose width is the viewport's and whose height is
 * fixed. They read as ground, not as a measurement — and `GoalRange`, which
 * DOES carry figures, keeps its uniform scaling for exactly that reason.
 */
function Frieze({ state }: { state: AuthArt }) {
  const near = RANGE_SILHOUETTES[1];
  const dimmed = state === 'clouded';

  return (
    <svg
      className="auth-entry-frieze"
      viewBox={`0 0 ${FRIEZE_W} ${FRIEZE_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Back row. Quietest, and partly hidden by the front one. */}
      <g fill={PEAK} opacity={dimmed ? 0.16 : 0.22}>
        {FAR.map((peak, i) => (
          <path key={`f${i}`} d={RANGE_SILHOUETTES[peak[3]].body} transform={placed(peak)} />
        ))}
      </g>

      {/* The feature peak, between the rows, carrying this screen's state. */}
      <g transform={placed(FEATURE)}>
        <path d={near.body} fill={PEAK} opacity={dimmed ? 0.26 : 0.36} />
        {near.shade && (
          <path d={near.shade} fill={PEAK_SHADE} opacity={dimmed ? 0.2 : 0.3} />
        )}
        {near.snow && (
          <path d={near.snow} fill={INK} opacity={(near.snowOpacity ?? 0.5) * 0.4} />
        )}

        {(state === 'partway' || state === 'rejoined') && (
          <path
            d={TRAIL}
            fill="none"
            stroke={KICK}
            strokeWidth={1.4}
            strokeDasharray="3 3"
            opacity={state === 'rejoined' ? 0.5 : 0.42}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {state === 'partway' && (
          <>
            <circle cx={CLIMBER.x} cy={CLIMBER.y} r={2.4} fill={KICK} opacity={0.75} />
            <circle
              cx={CLIMBER.x}
              cy={CLIMBER.y}
              r={4.6}
              fill="none"
              stroke={KICK}
              strokeWidth={0.8}
              opacity={0.4}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {state === 'lost' && (
          <>
            <path
              d={TRAIL_STUB}
              fill="none"
              stroke={KICK}
              strokeWidth={1.4}
              strokeDasharray="3 3"
              opacity={0.42}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={TRAIL_FADED}
              fill="none"
              stroke={KICK}
              strokeWidth={1.4}
              strokeDasharray="2 6"
              opacity={0.16}
              vectorEffect="non-scaling-stroke"
            />
            <path d={MARKER_POST} stroke={KICK} strokeWidth={1.2} opacity={0.6}
              vectorEffect="non-scaling-stroke" />
            <path d={MARKER_FLAG} fill={KICK} opacity={0.6} />
          </>
        )}
        {dimmed && <path d={CLOUD} fill={INK} opacity={0.4} />}
      </g>

      {/* Front row, a shade stronger, overlapping the back one. */}
      <g fill={PEAK_LIT} opacity={dimmed ? 0.24 : 0.34}>
        {NEAR.map((peak, i) => (
          <path key={`n${i}`} d={RANGE_SILHOUETTES[peak[3]].body} transform={placed(peak)} />
        ))}
      </g>

      {/* *** THE SHELF EDGE, DRAWN LAST. *** pantryPal's jars stand on a line,
          and without one a row of silhouettes floats. This is the single
          element that makes the frieze read as objects standing somewhere
          rather than as a decorative border — and it goes last so it sits in
          front of every base rather than behind them. */}
      <rect x={0} y={GROUND} width={FRIEZE_W} height={4} fill={KICK} opacity={0.2} />
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
    <div className="auth-entry" style={{ background: PAGE }}>
      {/* *** THE WAY BACK LIVES IN THE SHELL NOW. *** Login and Register each
          carried their own identical absolutely-positioned "Back to Home" link,
          and ForgotPassword, ResetPassword and the OIDC failure had none — so
          three of the five screens were a dead end unless you knew the logo was
          not a link. One copy, on all five. */}
      {/* *** POINTS AT `/welcome`, NOT `/`, SINCE LOGIN BECAME THE INDEX. ***
          Left at `/` it would have linked the login page to ITSELF — which is
          the dead end this one shared link was created to remove, reintroduced
          by a routing change. The marketing page is what "home" means here. */}
      <Link to="/welcome" className="auth-entry-back" style={{ color: SOFT }}
        onMouseEnter={(e) => { e.currentTarget.style.color = INK; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = SOFT; }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          aria-hidden="true" focusable="false">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Home
      </Link>

      <div className="auth-entry-hero">
        <span
          style={{
            fontSize: '0.6875rem',
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: KICK,
          }}
        >
          {kicker}
        </span>
        {/* *** STILL A `<p>`, NOT A HEADING. *** It is now the largest text on
            the page, which makes the temptation to promote it to an `h1`
            stronger rather than weaker — and `every-page.spec.ts` asserts
            exactly one `h1` per route. The form owns it. */}
        <p
          style={{
            margin: '1rem 0 0.75rem',
            fontSize: '2.375rem',
            fontWeight: 800,
            letterSpacing: '-0.026em',
            lineHeight: 1.08,
            maxWidth: '15ch',
            color: INK,
          }}
        >
          {headline}
        </p>
        <p style={{ margin: 0, fontSize: '0.96875rem', lineHeight: 1.55, maxWidth: '34ch', color: SOFT }}>
          {blurb}
        </p>
      </div>

      <div
        className="auth-entry-panel"
        style={{
          background: PANEL,
          border: '1px solid rgba(134, 239, 172, 0.16)',
          /* `short` no longer sets a minimum height — the panel is sized by its
             own content now that the page, not the panel, owns the viewport.
             The prop is kept because all five pages pass it and it still says
             something true about the screen: a short one gets less air above
             the frieze. */
          marginBottom: short ? '1.5rem' : '2.5rem',
        }}
      >
        {children}
        {/* *** THE palStack FOOTER MOVED IN HERE TOO. *** Login and Register
            each carried an identical copy and the other three screens had
            none — the same duplication as "Back to Home", one element lower.
            Inside the panel column rather than centred across the page: the
            frieze owns the bottom of the page now, and a line of text over a
            horizon is a line of text in the sky. */}
        <p style={{
          margin: '1.25rem 0 0',
          textAlign: 'center',
          color: SOFT,
          fontSize: '0.8125rem',
        }}>
          part of palStack ecosystem
        </p>
      </div>

      <Frieze state={art} />
    </div>
  );
}
