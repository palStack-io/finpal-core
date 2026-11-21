import React from 'react';
import { HeroRidge } from './HeroRidge';

/**
 * The page hero: ONE component for every page (Harun 2026-11-20, `finPal/docs/design/finpal-design-brief.md`,
 * "The page hero"). Core edition of premium's PageHero (Dashboard C), with core's own CSS motion.
 *
 *   ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 *   │ Title (30 px)  [context pill]                                      [ action ]  or  art   │
 *   │ the page's one answer                                                                    │
 *   │ ~~~~~~~~~~~~~~~~~~~~~~~ the decorative ridgeline (default art) ~~~~~~~~~~~~~~~~~~~~~~~~~~ │
 *   └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Full content width, 260 px tall on a wide screen (min-height: it grows rather than clip), 24 px radius, 28 x 32
 * padding, the deep-green evening sky. Left: the title (the page's only h1), a context pill and the page's one
 * answer. Right: the page's one primary action, OR art anchored bottom-right (the Dashboard's range). Every hero
 * carries a mountain silhouette: a page with no art of its own gets the quiet `HeroRidge` along the bottom edge,
 * without asking. Lessons sit directly BELOW the hero, never inside it.
 *
 * Motion: the hero settles once (12 px rise, 400 ms, ease-out) via `.fp-page-hero` in finpal-theme.css; a `.fp-quiet`
 * ancestor turns that into a short fade, and reduced motion leaves it at rest. Inside the hero the text tokens are
 * white-on-sky (`--text-primary` and friends are redefined on `.fp-page-hero`).
 */
export interface PageHeroProps {
  /** The page title: rendered as the page's one h1. */
  title: React.ReactNode;
  /** The context pill beside the title, e.g. "November so far". */
  pill?: React.ReactNode;
  /** The page's one answer, under the title. */
  answer?: React.ReactNode;
  /** The page's one primary action (top-right). Use this OR `art`. */
  action?: React.ReactNode;
  /** Art anchored bottom-right (the range). Without it the hero draws the decorative ridgeline. */
  art?: React.ReactNode;
  /** id for the h1, so the section is named by it. */
  titleId?: string;
  'data-testid'?: string;
}

export const PageHero: React.FC<PageHeroProps> = ({ title, pill, answer, action, art, titleId = 'page-hero-title', ...rest }) => (
  <section
    className={art ? 'fp-page-hero fp-page-hero--art' : action ? 'fp-page-hero fp-page-hero--action' : 'fp-page-hero'}
    aria-labelledby={titleId}
    data-testid={rest['data-testid']}
  >
    {!art && <HeroRidge />}
    <div className="fp-page-hero__body">
      <div className="fp-page-hero__head">
        <h1 id={titleId} className="page-title fp-page-hero__title">{title}</h1>
        {pill && <span className="fp-page-hero__pill" data-testid="page-hero-pill">{pill}</span>}
      </div>
      {answer && <div className="fp-page-hero__answer">{answer}</div>}
    </div>
    {action && !art && <div className="fp-page-hero__action">{action}</div>}
    {art && <div className="fp-page-hero__art">{art}</div>}
  </section>
);

export default PageHero;
