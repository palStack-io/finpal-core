import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGuideStore } from '../../store/guideStore';
import type { GuidePage, GuideTourStep } from '../../services/onboardingService';

/**
 * A short guided tour: a popover beside its target on a wide screen, a bottom sheet
 * on a phone (a floating popover cannot be anchored on a 390px screen).
 *
 * *** A MISSING TARGET SKIPS ITS STEP. *** Steps are filtered against the live DOM
 * when the tour opens, so a layout change costs one step instead of a tour that points
 * at nothing; if no step has a target the tour closes itself.
 *
 * *** A DIALOG, UNLIKE THE CARD: *** focus moves in and is trapped, Escape skips, and
 * focus returns to where it was. Skipping RECORDS the tour as seen — the offer is not
 * meant to come back every visit.
 */
const MOBILE = '(max-width: 767px)';
const isMobile = () => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE).matches;
const find = (target: string) => document.querySelector<HTMLElement>(`[data-guide="${target}"]`);

export const GuideTour: React.FC<{ page: GuidePage; steps: GuideTourStep[] }> = ({ page, steps }) => {
  const finishTour = useGuideStore((s) => s.finishTour);
  // *** FILTERED AFTER MOUNT, NOT DURING RENDER. *** The targets belong to the page this
  // component is rendered inside, and none of them is in the DOM until that render commits.
  const [live, setLive] = useState<GuideTourStep[] | null>(null);
  useLayoutEffect(() => { setLive(steps.filter((s) => find(s.target))); }, [steps]);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const [mobile, setMobile] = useState(isMobile);

  const done = () => { void finishTour(page); returnTo.current?.focus?.(); };

  // No step has a target: nothing to show and nothing to record.
  useEffect(() => { if (live && live.length === 0) useGuideStore.setState({ touring: null }); }, [live]);

  const step = live?.[index];

  // Outline the target, bring it into view, and place the popover beside it.
  //
  // *** SCROLL INSTANTLY, THEN MEASURE, AND KEEP MEASURING. *** A smooth scroll is
  // asynchronous: the rectangle read straight after it is the OLD position, so the popover
  // landed away from the outlined target on every page whose target starts below the fold.
  // The position is recomputed on resize and scroll, and uses the popover's real height
  // (long Spanish text is taller than any constant).
  useLayoutEffect(() => {
    if (!step) return;
    const el = find(step.target);
    if (!el) return;
    el.classList.add('fp-guide-target');
    el.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    const place = () => {
      const phone = isMobile();
      setMobile(phone);
      if (phone) return;
      const r = el.getBoundingClientRect();
      const height = dialogRef.current?.offsetHeight || 180;
      const width = 320;
      const maxLeft = window.innerWidth - width - 8;
      // *** A TALL TARGET GETS THE POPOVER INSIDE ITS BOTTOM-RIGHT CORNER. *** Below it, the
      // popover would sit on whatever follows (on the Dashboard, the range's popover covered the
      // totals row). "Tall" is more than a third of the viewport.
      if (r.height > window.innerHeight / 3) {
        setPos({ top: Math.max(8, r.bottom - height - 12), left: Math.min(Math.max(8, r.right - width - 12), maxLeft) });
        return;
      }
      const below = r.bottom + 12;
      const top = below + height > window.innerHeight ? Math.max(8, r.top - 12 - height) : below;
      setPos({ top, left: Math.min(Math.max(8, r.left), maxLeft) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      el.classList.remove('fp-guide-target');
    };
  }, [step]);

  // Focus moves in ONCE, onto the dialog. Doing it on every step jumped a keyboard user
  // from "Next" to "Skip tour", so the next Enter ended the tour.
  useEffect(() => { if (live && live.length > 0) dialogRef.current?.focus(); }, [live]);

  // Focus in, trap Tab, Escape skips.
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!step || !live) return null;
  const last = index === live.length - 1;

  const style: React.CSSProperties = mobile
    ? { position: 'fixed', left: 0, right: 0, bottom: 0, borderRadius: '16px 16px 0 0' }
    : { position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width: 320, borderRadius: '12px' };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={'Page tour'}
      tabIndex={-1}
      style={{ ...style, zIndex: 1000, padding: '16px', outline: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)',
               border: '1px solid var(--border-light)', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}
    >
      <h3 className="fp-item-title" style={{ margin: 0 }}>{step.title}</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, margin: '6px 0 12px' }}>{step.body}</p>
      <p aria-live="polite" style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 12px' }}>
        {`Step ${index + 1} of ${live.length}`}
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <button type="button" onClick={done}
                style={{ padding: '8px 12px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Skip tour
        </button>
        <span style={{ display: 'flex', gap: '8px' }}>
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)}
                    style={{ padding: '8px 14px', background: 'var(--border-light)', border: 'none', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Back
            </button>
          )}
          <button type="button" onClick={() => (last ? done() : setIndex(index + 1))}
                  style={{ padding: '8px 14px', background: 'var(--brand-main-green)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
            {last ? 'Done' : 'Next'}
          </button>
        </span>
      </div>
    </div>,
    document.body,
  );
};

export default GuideTour;
