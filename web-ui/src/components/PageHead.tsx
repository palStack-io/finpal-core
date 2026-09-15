import React from 'react';
import { HEAD_BANDS } from '../utils/headBands';

interface PageHeadProps {
  /** The page's single h1. */
  title: string;
  /** One sentence saying what the page is for. Optional, but almost always wanted. */
  subtitle?: React.ReactNode;
  /** Actions, filters or the coin purse. Sits top-right, clear of the title. */
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
 * `className="page-title"` is KEPT on the h1 deliberately. The role class
 * carries this project's history of title sizing (it once claimed 28px where
 * every page rendered 32px), and a rule nothing references is a rule nothing
 * keeps right — `roleClassesAreReferenced.test.ts` exists for exactly that. One
 * component referencing it is better than eleven pages referencing it.
 *
 * The band is `aria-hidden`: it is decoration and never the only thing carrying
 * a fact.
 */
export const PageHead: React.FC<PageHeadProps> = ({ title, subtitle, right, band, children }) => {
  const ridge = HEAD_BANDS[band];

  return (
    <div
      style={{
        background: 'linear-gradient(178deg, var(--head-sky), var(--bg-card) 96%)',
        borderBottom: '1px solid var(--border-light)',
        padding: '24px 24px 0',
        position: 'relative',
      }}
    >
      <h1 className="page-title" style={{ fontSize: '27px', marginBottom: '3px' }}>{title}</h1>
      {subtitle && (
        <p style={{
          margin: '0 0 14px',
          color: 'var(--text-secondary)',
          fontSize: '13.5px',
          maxWidth: '600px',
        }}>
          {subtitle}
        </p>
      )}

      {/* Absolute, so a long title wraps under the actions instead of shoving
          them off the row — which is what the flex version did at 768px. */}
      {right && (
        <div style={{
          position: 'absolute', top: '24px', right: '24px',
          display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap',
          justifyContent: 'flex-end', maxWidth: '55%',
        }}>
          {right}
        </div>
      )}

      {children}

      <svg
        viewBox="0 0 1100 52"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        style={{ display: 'block', width: '100%', height: '52px' }}
      >
        <path d={ridge.d} fill="var(--head-ridge)" opacity={ridge.opacity} />
      </svg>
    </div>
  );
};

export default PageHead;
