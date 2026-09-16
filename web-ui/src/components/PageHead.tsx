import React from 'react';
import { HEAD_BANDS } from '../utils/headBands';

interface PageHeadProps {
  /** The page's single h1. */
  title: string;
  /** One sentence saying what the page is for. Optional, but almost always wanted. */
  subtitle?: React.ReactNode;
  /** Actions, filters or the coin purse. Sits beside the title, wrapping under it when narrow. */
  right?: React.ReactNode;
  /** Which ridge to draw. Keys are in `headBands.ts`. */
  band: keyof typeof HEAD_BANDS;
  children?: React.ReactNode;
}

/**
 * The head of a page: a title, a sentence, an action slot and an illustrated
 * ridge band, on a sky that fades into the card below it.
 *
 * *** WHAT THIS REPLACES, AND WHY IT IS A COMPONENT RATHER THAN A PATTERN. ***
 * Eleven pages opened with the same hand-rolled block — a flex row, a
 * `.page-title` h1, a `<p>` in one of three different styles, and a button
 * cluster — and no two of them agreed on the gap, the wrap behaviour or the
 * subtitle's colour. That is the shape the mockups replace, and copying the new
 * one eleven times would only move the drift rather than remove it.
 *
 * *** THE LAYOUT LIVES IN `finpal-theme.css` AS ROLE CLASSES, NOT INLINE. ***
 * Not for tidiness: the actions need a media query. The first version placed
 * them absolutely and they covered the subtitle at 390px, which no gate can see
 * because the responsive walk measures overflow and an overlap is inside the
 * viewport. The role classes use flow plus `flex-wrap`, so the actions drop
 * below the sentence when there is no room — overlap is impossible rather than
 * tuned out. The reasoning is written beside the rules.
 *
 * `className="page-title"` is KEPT on the h1 deliberately. The role class
 * carries this project's history of title sizing (it once claimed 28px where
 * every page rendered 32px), and a rule nothing references is a rule nothing
 * keeps right — `roleClassesAreReferenced.test.ts` exists for exactly that. One
 * component referencing it is better than eleven pages referencing it.
 */
export const PageHead: React.FC<PageHeadProps> = ({ title, subtitle, right, band, children }) => {
  const ridge = HEAD_BANDS[band];

  return (
    <div className="fp-page-head">
      <div className="fp-page-head-top">
        <div className="fp-page-head-text">
          {/* 27px, where `.page-title` says 32px. The mockups set the smaller
              size and the role class note says changing it is a design decision
              rather than a consolidation — this is that decision, applied where
              the head has been adopted. When every page is converted, the class
              itself should come down to 27 and this override should go. */}
          <h1 className="page-title" style={{ fontSize: '27px', marginBottom: '3px' }}>{title}</h1>
          {subtitle && <p className="fp-page-head-sub">{subtitle}</p>}
        </div>
        {right && <div className="fp-page-head-actions">{right}</div>}
      </div>

      {children}

      <svg
        className="fp-page-head-band"
        viewBox="0 0 1100 52"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        {/* The base first, so the ridge sits in front of it. */}
        {ridge.base && (
          <path d={ridge.base.d} fill="var(--head-ridge)" opacity={ridge.base.opacity} />
        )}
        <path d={ridge.d} fill="var(--head-ridge)" opacity={ridge.opacity} />
      </svg>
    </div>
  );
};

export default PageHead;
