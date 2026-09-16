/**
 * *** THE AUTH SCREENS' MOUNTAINS MUST BE THE APP'S MOUNTAINS, NOT A COPY OF
 * THEM. ***
 *
 * `docs/mockups/auth-web.html` makes one load-bearing promise about the sheet it
 * drew: *"The art is REUSED, not drawn for this sheet… If these screens are
 * built, they import the file; they do not carry their own copy."* A `d`
 * attribute pasted into `AuthShell.tsx` would satisfy every visual check and
 * quietly turn that sentence into a false claim about the code — and then the
 * sign-in screen's Ben Nevis would drift from the dashboard's, one edit at a
 * time, with nothing to notice it.
 *
 * So this file asserts the negative: the geometry is in exactly ONE place.
 *
 * It also pins the three things about these screens that no browser gate can
 * see. The contrast walk captures signed-IN pages only — there is no `login` or
 * `register` scope in `scripts/contrast-walk/captured/` — so the auth palette's
 * ratios are computed here instead, the same way the Settings rail tags were.
 * And the responsive walk cannot tell a decorative peak from a data peak, which
 * is the third rule below and the one with a defect series behind it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RANGE_SILHOUETTES, RANGE_UNMEASURED } from '../../utils/rangeSilhouettes';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const SHELL = 'src/components/auth/AuthShell.tsx';
const AUTH_PAGES = [
  'src/pages/Login.tsx',
  'src/pages/Register.tsx',
  'src/pages/ForgotPassword.tsx',
  'src/pages/ResetPassword.tsx',
  'src/pages/OidcCallback.tsx',
];

/** Strip comments: these files EXPLAIN the paths they must not contain. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── the geometry lives in one place ──────────────────────────────────────────

describe('the range art is imported, never copied', () => {
  it('has a silhouette table to compare against', () => {
    // Guards the guard: an empty table makes every assertion below vacuous.
    expect(RANGE_SILHOUETTES.length).toBe(6);
    expect(RANGE_SILHOUETTES[1].body).toContain('M0,100');
  });

  it('AuthShell imports the shared table', () => {
    expect(codeOnly(read(SHELL)))
      .toMatch(/import\s*\{[^}]*RANGE_SILHOUETTES[^}]*\}\s*from\s*'\.\.\/\.\.\/utils\/rangeSilhouettes'/);
  });

  it.each([
    ['body', 1], ['shade', 1], ['snow', 1],
    ['body', 0], ['shade', 0],
  ] as const)('never inlines RANGE_SILHOUETTES[%i].%s', (part, band) => {
    const d = RANGE_SILHOUETTES[band][part as 'body'];
    expect(d, `band ${band} has no ${part}`).toBeTruthy();
    expect(
      codeOnly(read(SHELL)).includes(d!),
      `AuthShell carries its own copy of RANGE_SILHOUETTES[${band}].${part} — `
        + 'a d-attribute in two places is a d-attribute that drifts',
    ).toBe(false);
  });

  it('no auth PAGE carries peak geometry either', () => {
    // The pages pass a state name and nothing else; if one of them ever draws
    // its own peak, the five screens stop being one design.
    const peaks = [RANGE_SILHOUETTES[0].body, RANGE_SILHOUETTES[1].body];
    for (const page of AUTH_PAGES) {
      const code = codeOnly(read(page));
      for (const d of peaks) {
        expect(code.includes(d), `${page} inlines a silhouette`).toBe(false);
      }
    }
  });

  it('the 404 reuses the UNMEASURED ridge rather than drawing a flat line', () => {
    // Semantics, not tidiness: `RANGE_UNMEASURED` is the shape for a goal finPal
    // cannot size, and its own comment says it "must never look like a climb".
    // A page that does not exist is the same statement.
    const code = codeOnly(read('src/pages/NotFound.tsx'));
    expect(code).toMatch(/RANGE_UNMEASURED/);
    expect(code.includes(RANGE_UNMEASURED.body)).toBe(false);
  });
});

// ── every pre-auth screen is in the same shell ───────────────────────────────

describe('all five pre-auth screens adopt the shell', () => {
  it.each(AUTH_PAGES)('%s renders AuthShell', (page) => {
    const code = codeOnly(read(page));
    expect(code).toMatch(/import AuthShell from/);
    // Keyed to `<AuthShell` followed by whitespace or `>` — `includes('<AuthShell')`
    // would also match `<AuthShellSomethingElse`, which is the prefix-matching
    // mistake `pageShells.test.ts` made with `<PageHead`.
    expect(code).toMatch(/<AuthShell[\s/>]/);
  });

  it('each screen picks a DIFFERENT state, because the state is the message', () => {
    const states = AUTH_PAGES.map((page) => {
      const found = [...codeOnly(read(page)).matchAll(/art="([a-z]+)"/g)]
        .map((m) => m[1]);
      return [page.split('/').pop(), [...new Set(found)]] as const;
    });
    // ForgotPassword and ResetPassword each render two states of their own
    // screen (before/after), so a page may legitimately use one value twice;
    // what must not happen is two DIFFERENT screens showing the same picture.
    const used = states.map(([, s]) => s[0]);
    expect(new Set(used).size, `states were ${JSON.stringify(states)}`)
      .toBe(AUTH_PAGES.length);
  });

  it('the shell offers no way to drive the art from a figure', () => {
    /* *** DECORATION THAT LOOKS LIKE DATA IS D-102's EXACT SHAPE. *** The
       climber partway up a slope implies progress, and at sign-in finPal does
       not know who you are — it cannot know whether you have goals or how far up
       one you are. So the art must be fixed and identical for every visitor. A
       prop taking a number, a percentage or a goal would be the moment that
       stopped being true, which is why the props are asserted rather than just
       written carefully. */
    const code = codeOnly(read(SHELL));
    const props = code.match(/export interface AuthShellProps \{[\s\S]*?\n\}/)?.[0];
    expect(props, 'AuthShellProps not found — this assertion is vacuous').toBeTruthy();
    expect(props).not.toMatch(/:\s*number/);
    expect(props).not.toMatch(/progress|percent|goal|altitude|band\b/i);
  });
});

// ── the colours, measured here because no walk captures these pages ──────────

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The three surfaces a pre-auth screen paints, darkest of the art panel last. */
const SURFACES = ['#0E1711', '#16241A', '#1B3024'];

describe('the auth palette is legible, computed rather than captured', () => {
  it('the maths agrees with a known reference', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it.each(['#ffffff', '#e2e8f0', '#9CB3A3', '#86efac', '#22c55e'])(
    '%s clears AA as text on all three pre-auth surfaces',
    (fg) => {
      SURFACES.forEach((bg) => {
        expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      });
    },
  );

  it('the field border clears 1.4.11 non-text contrast, where slate did not', () => {
    /* *** EVERY INPUT ON LOGIN AND REGISTER HAD A 1.56:1 BORDER. *** They were
       `1px solid #334155` on a `rgba(255,255,255,0.05)` fill, so the border was
       the only thing identifying the field and it was six times below the 3:1
       that WCAG 1.4.11 asks of a control's boundary. Unmeasured by everything:
       the contrast walk does not capture signed-out pages, and axe's
       color-contrast rule is disabled in the e2e run and would not cover a
       border anyway. Found by resolving the value by hand while restyling. */
    SURFACES.forEach((bg) => {
      expect(contrast('#334155', bg), `the old slate border on ${bg}`).toBeLessThan(2);
      expect(contrast('#517E60', bg), `the new border on ${bg}`).toBeGreaterThanOrEqual(3);
    });
  });

  it('records the two text roles that were failing AA on the card', () => {
    /* Both were used as `color:` on the pre-auth cards, and the FIRST one is
       contradicted by a comment in the same file — the banner in
       ForgotPassword says in as many words that #15803d "is only 3.64:1 against
       the new page background, so it is wrong for TEXT", and Login and Register
       then used it as the text colour of their sign-in/sign-up links. A rule
       written down in the file that breaks it. */
    expect(contrast('#15803d', '#16241A')).toBeLessThan(4.5);   // 3.22:1, link text
    expect(contrast('#64748b', '#16241A')).toBeLessThan(4.5);   // 3.39:1, footer + divider
    expect(contrast('#22c55e', '#16241A')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#9CB3A3', '#16241A')).toBeGreaterThanOrEqual(4.5);

    // And the hover state: #166534 was what a link BECAME on mouseover, which
    // is a link that hovers into illegibility.
    expect(contrast('#166534', '#16241A')).toBeLessThan(3);
    expect(contrast('#86efac', '#16241A')).toBeGreaterThanOrEqual(4.5);
  });

  it('the values it pins are the values the files actually use', () => {
    // A ratio table that has drifted from the source is worse than none: it
    // reads as evidence. So the fixed border is asserted to be present, and the
    // failing values to be absent, in the code rather than in a comment.
    const all = AUTH_PAGES.concat(SHELL).map((p) => codeOnly(read(p))).join('\n');
    expect(all).toContain('#517E60');
    expect(all).not.toContain('#334155');
    expect(all).not.toContain('#64748b');
    expect(all).not.toMatch(/color: '#15803d'/);
  });
});
