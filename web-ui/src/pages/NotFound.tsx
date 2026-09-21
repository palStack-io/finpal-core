/**
 * *** finPal HAD NO 404 PAGE, AND NOTHING WAS BROKEN — A DECISION HAD JUST
 * NEVER BEEN TAKEN. *** `App.tsx`'s catch-all rendered a `<Navigate>`: a signed-in
 * user who mistyped a URL landed on `/dashboard`, a stranger landed on `/`, and
 * neither was told that anything had happened.
 *
 * That redirect was itself a fix. Before it, the catch-all fell through to
 * `Landing`, so a signed-in user following a stale `/learnpal` link was shown
 * the signed-out sales pitch for the product they were already inside. Sending
 * them to the dashboard was strictly better. It was still silent.
 *
 * *** AND SILENT IS WORSE THAN IT LOOKS ON A FINANCE APP. *** A stale bookmark,
 * a link truncated in an email, a group somebody deleted — all three currently
 * read as "finPal moved me to the dashboard for no reason". The sentence that
 * earns its place below is the last one: *nothing has gone wrong with your
 * data* is precisely what a person wonders when a money app relocates them
 * without being asked.
 *
 * This page is theme-aware, unlike the five pre-auth screens, and that is not an
 * inconsistency: it is reached from INSIDE the app as often as from outside, by
 * a signed-in reader whose theme choice already exists. The pre-auth pages are
 * hardcoded dark because nobody has a theme yet.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { RANGE_UNMEASURED } from '../utils/rangeSilhouettes';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  /**
   * *** "BACK" IS ONLY OFFERED WHEN THERE IS A BACK. *** A 404 arrived at from a
   * bookmark or a pasted link is the first entry in this tab's history, and
   * `navigate(-1)` from there does nothing at all — a button that looks like it
   * failed is worse than a button that is not there.
   */
  const hasSomewhereBack = window.history.length > 1;

  const primary: React.CSSProperties = {
    display: 'inline-block',
    padding: '9px 18px',
    borderRadius: '8px',
    /* *** `var(--accent-primary)` WAS WRITTEN HERE FIRST AND THAT TOKEN DOES
       NOT EXIST. *** Measured: zero occurrences in `finpal-theme.css`. An
       undefined custom property resolves to nothing at all, so the button had
       no background and rendered `white` text on the page — #ffffff on #fbfcf9,
       1.03:1, the primary action on a brand-new page. Nothing in the source
       says so: a typo'd token is not a type error, `npm run typecheck` is happy,
       and the button still looks like a button in a screenshot if you are not
       looking for it. D-60's shape exactly (a Tailwind-shaped class resolving to
       no rule at all), and it was caught by the contrast walk within minutes of
       this page being added to the capture — a page that, until this pass, no
       walk had ever rendered. `--brand-main-green` is the real token and white
       on it is 5.02:1. */
    background: 'var(--brand-main-green)',
    color: 'white',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
  };

  const secondary: React.CSSProperties = {
    ...primary,
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-medium)',
    marginLeft: '8px',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '30rem',
        border: '1px dashed var(--border-medium)',
        borderRadius: '14px',
        background: 'var(--bg-secondary)',
        padding: '30px 30px 0',
        textAlign: 'center',
        overflow: 'hidden',
      }}>
        <p style={{
          fontSize: '44px',
          fontWeight: 800,
          margin: '0 0 6px',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-primary)',
          lineHeight: 1,
        }}>
          404
        </p>
        <h1 style={{
          fontSize: '17px',
          fontWeight: 600,
          margin: '0 0 4px',
          color: 'var(--text-primary)',
        }}>
          That page is not here
        </h1>
        <p style={{
          margin: '0 auto 18px',
          maxWidth: '26rem',
          fontSize: '13.5px',
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
        }}>
          The link may be old, or the thing it pointed at may have been deleted.
          Nothing has gone wrong with your data.
        </p>

        {user ? (
          <Link to="/dashboard" style={primary}>Go to dashboard</Link>
        ) : (
          /* `/` is the LOGIN page now (owner, 2026-09-17), so the label says
             what the link actually does. "Home page" would have been a promise
             the route stopped keeping. */
          <Link to="/" style={primary}>Go to sign in</Link>
        )}
        {hasSomewhereBack && (
          <button type="button" style={secondary} onClick={() => navigate(-1)}>
            Back
          </button>
        )}

        {/* *** THE ONE SILHOUETTE IN THE TABLE THAT MEANS "NO MEASUREMENT". ***
            `RANGE_UNMEASURED` is a flat ridge with no summit and no snow, drawn
            for a goal finPal cannot size — its comment says it "must never look
            like a climb". A page that does not exist is the same statement, so
            this is the shape rather than a decorative one, and it is imported
            from the shared table rather than drawn here. */}
        <svg
          viewBox="0 0 100 26"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
          style={{ display: 'block', width: '100%', height: '46px', marginTop: '22px' }}
        >
          <g transform="scale(1,0.26)">
            <path d={RANGE_UNMEASURED.body} fill="var(--head-ridge)" opacity={0.5} />
          </g>
        </svg>
      </div>
    </div>
  );
};

export default NotFound;
