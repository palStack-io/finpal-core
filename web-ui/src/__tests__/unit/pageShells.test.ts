/**
 * U-03 — the extracted page shells must keep rendering what they replaced.
 *
 * Seven pages each inlined a byte-identical `<h1>` style and a byte-identical
 * outer wrapper. Both are now `.page-title` and `.page-container`.
 *
 * **The reconciliation is the part worth guarding.** `.page-title` already
 * existed, was used by nothing, and said `font-size: 28px; margin: 0` — while
 * every page rendered `32px` with `8px` beneath it. So "point the pages at the
 * design system" would have shrunk every title on the app. The class was
 * changed to match the pages, not the other way round: keeping the rendering
 * identical is what makes this a refactor, and resizing headings is a design
 * decision that belongs to the owner.
 *
 * These assertions pin the values the inline styles had. If someone later
 * decides 28px was right after all, this test should be UPDATED deliberately —
 * failing here means the size changed, which is exactly the event worth
 * noticing, because nothing else in the suite renders these pages against real
 * CSS. jsdom does not apply an external stylesheet, so a rendering test would
 * pass no matter what these rules said.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const theme = readFileSync(
  resolve(process.cwd(), 'src/styles/finpal-theme.css'), 'utf8');

/** The body of `selector { ... }`, comments stripped. */
function rule(selector: string): string {
  const at = theme.indexOf(`${selector} {`);
  expect(at, `${selector} is not defined`).toBeGreaterThan(-1);
  const body = theme.slice(at + selector.length + 2, theme.indexOf('}', at));
  return body.replace(/\/\*[\s\S]*?\*\//g, '');
}

const declares = (selector: string, prop: string, value: string) => {
  const found = rule(selector)
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${prop}:`));
  expect(found, `${selector} does not declare ${prop}`).toBeDefined();
  expect(found!.replace(`${prop}:`, '').trim()).toBe(value);
};

describe('.page-title carries what the seven pages inlined', () => {
  // The exact inline block it replaced:
  //   fontSize: '32px', fontWeight: 700, marginBottom: '8px',
  //   color: 'var(--text-primary)'
  it('is 32px, not the 28px the unused class used to say', () => {
    declares('.page-title', 'font-size', '32px');
  });

  it('keeps the 8px below the heading', () => {
    declares('.page-title', 'margin', '0 0 8px');
  });

  it('keeps weight and colour', () => {
    declares('.page-title', 'font-weight', '700');
    declares('.page-title', 'color', 'var(--text-primary)');
  });
});

describe('.page-container carries what the seven pages inlined', () => {
  it('matches maxWidth 1400px, margin 0 auto', () => {
    declares('.page-container', 'max-width', '1400px');
    declares('.page-container', 'margin', '0 auto');
  });
});

describe('the shells are actually used', () => {
  /**
   * Both classes were defined-and-unused before this change, which is the
   * condition that let `.page-title` drift away from the app unnoticed. A rule
   * nothing references cannot be wrong, so nothing keeps it right.
   */
  /*
   * *** THE GLOB READ `pages/*.tsx` ONLY, SO IT WAS BLIND TO ALL EIGHT MODULE
   * PAGES — AND ONE OF THEM HAND-ROLLS ITS OWN HEAD. *** learnPal contributes
   * three routed pages and pointsPal five, every one of them a top-level route
   * in `App.tsx`'s module manifests, and `pointspal/pages/Redeem.tsx` defines a
   * local `PageHeader` component and renders it twice. The property below —
   * "no page hand-rolls a title instead" — is exactly what should have caught
   * that, and could not see the file. D-222's lesson a second time: a gate's
   * coverage is a lower bound on the shapes it can see, so the question to ask
   * of any sweep is which files it OMITS.
   */
  const sources = {
    ...import.meta.glob('../../pages/*.tsx', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>,
    ...import.meta.glob('../../modules/*/pages/*.tsx', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>,
    ...import.meta.glob('../../modules/*/*.tsx', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>,
  } as Record<string, string>;

  const usages = (name: string) =>
    Object.entries(sources).filter(([, s]) => s.includes(`className="${name}"`));

  /**
   * *** THIS WAS A COUNT AND THE COUNT BECAME THE WRONG QUESTION. ***
   * It asserted `.page-title` appeared on at least five pages, which was the
   * right gate while every page hand-rolled its own head. Pages now render
   * `PageHead`, which carries `className="page-title"` once on behalf of all of
   * them — so the count fell as the adoption rose, and a gate that goes red
   * because a shared component replaced eight copies is measuring the opposite
   * of what it means to.
   *
   * The property that actually matters is unchanged and is now asserted
   * directly: the rule is referenced, and **no page invents its own page
   * title**. A page either renders `PageHead` or uses the class; either way
   * `.page-title` has a consumer, which is the condition that keeps it from
   * drifting away from the app unnoticed (it once declared 28px where every
   * page rendered 32px).
   */
  it('page-title has a consumer, and no page hand-rolls a title instead', () => {
    /* *** `includes('<PageHead')` ALSO MATCHES `<PageHeader />`, AND THAT IS
       NOT A TYPO — `pointspal/pages/Redeem.tsx` DEFINES ITS OWN LOCAL
       `PageHeader` COMPONENT AND RENDERS IT TWICE. *** So the file passed this
       gate for hand-rolling precisely the thing the gate forbids, by a prefix
       collision in the needle. This project's own lesson: guards keyed to a
       spelling go blind. Matched on the closing punctuation instead, so only a
       real `<PageHead ...>` or `<PageHead/>` counts. */
    const RENDERS_PAGE_HEAD = /<PageHead[\s/>]/;
    const viaHead = Object.entries(sources).filter(([, src]) => RENDERS_PAGE_HEAD.test(src));
    const direct = usages('page-title');
    expect(viaHead.length + direct.length,
      'nothing references .page-title any more').toBeGreaterThanOrEqual(5);

    // A page with neither is either title-less or drawing its own, and both are
    // the drift this file exists to prevent.
    /**
     * *** THE PRE-LOGIN PAGES ARE NOT APP PAGES, AND THAT IS THE WHOLE
     * EXEMPTION. *** They render outside the sidebar shell, with no page head,
     * no member filter and no ridge band — Landing's h1 is a marketing hero and
     * the four auth screens' are form titles. Holding them to the in-app head
     * would mean giving a signed-out page a "Show figures for" slot.
     *
     * This is deliberately the SAME set `authPagesUseBrandColours.test.ts`
     * governs (minus its OIDC callback, which renders no heading), because two
     * different ideas of "the pages before login" is how a gate ends up
     * exempting something nobody meant it to. Listed rather than pattern-matched
     * so a sixth entry costs a visible diff.
     */
    const NOT_AN_APP_PAGE = [
      'Landing.tsx', 'Login.tsx', 'Register.tsx',
      'ForgotPassword.tsx', 'ResetPassword.tsx', 'OidcCallback.tsx',
      // The first-run flow is full-screen panels with their own progress
      // chrome, reached before the sidebar exists. Its h1 is a panel heading
      // that changes per step, not a page title.
      'Onboarding.tsx',
      /**
       * *** SETTINGS IS EXEMPT BY DECISION, NOT BY OMISSION — AND THIS ENTRY
       * STOPPED BEING A TODO ON 2026-09-15. *** It is a genuine app page, but
       * it has a TWO-PANE shell of its own — a nav rail beside a content
       * column — and its h1 is the rail's own 18px title, not a page head.
       * Dropping `PageHead` in would put a 27px title and a 52px ridge band
       * inside a 232px rail.
       *
       * This entry previously read "a TODO with a reason ... remove this line
       * when that mockup exists". The mockup now exists
       * (`docs/mockups/settings-web.html`, outer repo) and it decided the
       * opposite of what that sentence assumed: Settings is **the one page that
       * does not get the title and the band**, because every other page opens
       * that way for being ONE subject and Settings is nine. What the sheet
       * changed instead is that the rail carries each section's state
       * (`utils/settingsRailTags.ts`), which is chrome this page already had.
       *
       * So the line stays, and removing it would now be the regression. It is
       * a recorded design decision with a drawn alternative behind it.
       */
      'Settings.tsx',
      /**
       * *** THE 404 IS NOT A SUBJECT, SO IT HAS NO SUBJECT LINE. *** `PageHead`
       * is a title, a sentence saying what the page is FOR, an action slot and a
       * ridge band — the opening of a page about one thing. A page that does not
       * exist is not about one thing; it is an answer to a mistake. It renders
       * its own centred panel with the `404`, an h1, one sentence and two
       * destinations, and a ridge band over that would be decoration on an
       * error.
       *
       * Listed here rather than given a head, deliberately, and the alternative
       * was drawn first: `docs/mockups/entry-web.html`.
       */
      'NotFound.tsx',
      /* *** THE FIVE pointsPal EXEMPTIONS ARE GONE, AND THE DECISION THEY
         WERE WAITING ON IS THE REASON. *** They said: "REMOVE THESE when the
         coins spec is approved and pointsPal is redrawn, OR when a decision
         says pointsPal keeps its own type scale." The owner took the second
         kind of decision on 2026-09-16 — adopt the app's head, keep Bricolage
         Grotesque for the figures and card faces — so all five now render
         `PageHead` and need no exemption.

         *** AND THE PREMISE THE EXEMPTION WAS WRITTEN ON TURNED OUT TO BE
         WRONG. *** It said converting them "would pre-empt a decision the
         owner has not taken", because `coins/pages-web-2.html` draws pointsPal.
         Reading that sheet instead of assuming: it draws the Overview with
         `<h1>` + subtitle + a `right` slot + a ridge band, which IS
         `PageHead`'s shape. The coins design was drawn assuming this
         conversion, so adopting the head implements it rather than pre-empting
         it. `docs/mockups/pointspal-web.html` records that finding.

         `Redeem`'s local `<PageHeader />` — the prefix match that hid it from
         this very gate (D-234) — is deleted rather than worked around. */
    ];

    for (const [file, src] of Object.entries(sources)) {
      if (NOT_AN_APP_PAGE.some((name) => file.endsWith(name))) continue;
      // Pages that are not a top-level route shell have no page title at all.
      if (!/<h1/.test(src) && !RENDERS_PAGE_HEAD.test(src)) continue;
      expect(
        RENDERS_PAGE_HEAD.test(src) || src.includes('className="page-title"'),
        `${file} renders an h1 without PageHead or .page-title`,
      ).toBe(true);
    }
  });

  it('page-container is on several pages', () => {
    expect(usages('page-container').length).toBeGreaterThanOrEqual(6);
  });

  it('and the inline forms they replaced are gone from those pages', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, `${file} still inlines the page-title block`).not.toContain(
        "fontSize: '32px', fontWeight: 700, marginBottom: '8px'");
      expect(source, `${file} still inlines the container block`).not.toContain(
        "maxWidth: '1400px', margin: '0 auto'");
    }
  });
});

describe('the extracted typography roles carry their inline values', () => {
  /**
   * Same contract as .page-title above: every value is copied from the inline
   * block it replaced, so rendering is unchanged. Pinned in text because jsdom
   * applies no external stylesheet — a rendering test cannot see these at all.
   *
   * These are named ROLES, not utilities. `.mb-16` would be hand-rolling the
   * Tailwind this project deliberately removed; a "hint" or a "section title"
   * is something the design has an opinion about, and a margin is not.
   */
  const cases: Array<[string, Array<[string, string]>]> = [
    ['.fp-hint', [['color', 'var(--text-secondary)'], ['font-size', '14px']]],
    ['.fp-hint-block', [['color', 'var(--text-secondary)'], ['font-size', '14px'],
                        ['margin-bottom', '16px']]],
    ['.fp-error-text', [['color', 'var(--accent-red)'], ['font-size', '14px'],
                        ['margin', '0']]],
    ['.fp-meta', [['color', 'var(--text-muted)'], ['font-size', '13px']]],
    ['.fp-item-title', [['color', 'var(--text-primary)'], ['font-size', '16px'],
                        ['font-weight', '600'], ['margin-bottom', '4px']]],
    ['.fp-section-title', [['font-size', '18px'], ['font-weight', '600'],
                           ['color', 'var(--text-primary)'], ['margin-bottom', '16px']]],
  ];

  it.each(cases)('%s', (selector, decls) => {
    for (const [prop, value] of decls) declares(selector, prop, value);
  });

  it('.fp-input is UNIFIED at 12px 16px — the pin moved deliberately, twice', () => {
    // Was `10px 14px`, pinned at that value on purpose so the next slice had to
    // reconcile it consciously rather than discover it mid-adoption. This is that
    // slice, and this line changing is the record of the decision.
    //
    // Slice 3 set it to `12px`, reconciling with the 11 inputs that inlined that.
    //
    // *** SLICE 4 THEN FOUND A SECOND SHARED DEFINITION AND THIS BECAME A DESIGN
    // DECISION RATHER THAN A RECONCILIATION. *** `inputStyle` in
    // src/styles/formStyles.ts said `12px 16px` and was used by TEN FORM FILES.
    // Two genuinely different populations, so there was no value that left
    // everything unchanged — unifying moved pixels either way, which is the
    // owner's call and not a refactor's. Owner picked `12px 16px` (2026-08-07).
    //
    // `inputStyle` is now DELETED, so this rule is the only definition and this
    // line is the only place the value lives.
    declares('.fp-input', 'padding', '12px 16px');
  });

  it('.fp-input keeps the other eight properties its adopters depend on', () => {
    // 10 elements dropped these from their inline styles in favour of the class.
    // If any one of these is edited away, those inputs lose the property silently
    // — jsdom applies no external stylesheet, so nothing renders differently in a
    // test and only this textual pin can see it.
    declares('.fp-input', 'background', 'var(--input-bg)');
    declares('.fp-input', 'border', '1px solid var(--input-border)');
    declares('.fp-input', 'border-radius', '8px');
    declares('.fp-input', 'color', 'var(--text-primary)');
    declares('.fp-input', 'font-size', '14px');
    declares('.fp-input', 'width', '100%');
    declares('.fp-input', 'outline', 'none');
  });

  it('.fp-input still carries the focus treatment that justified adopting it', () => {
    // The 10 adopters had NO focus response of their own. 14 other components set
    // exactly this pair imperatively in onFocus/onBlur, so this rule is the app's
    // existing convention expressed declaratively — not a new invention. If the
    // :focus block is dropped, those 10 inputs silently become the only ones in
    // the app that do not react to focus.
    declares('.fp-input:focus', 'background', 'var(--input-bg-focus)');
    declares('.fp-input:focus', 'border-color', 'var(--brand-main-green)');
  });
});
