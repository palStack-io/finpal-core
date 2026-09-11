import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

/** The dismiss control's accessible name, so focus can skip it. Must match
 *  the `aria-label` on the header button below. */
const CLOSE_LABEL = 'Close panel';
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const SlidePanel: React.FC<SlidePanelProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = '500px'
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`panel-title-${Math.random().toString(36).slice(2)}`).current;

  /**
   * *** `onClose` IS HELD IN A REF SO ITS IDENTITY CANNOT RE-RUN THIS EFFECT. ***
   * It used to be an effect dependency, and that turned a caller's ordinary
   * inline `onClose={() => setOpen(false)}` into a focus bug with teeth:
   *
   *   1. a new function identity on every parent render re-ran this effect,
   *   2. the re-run's `requestAnimationFrame` refocused the FIRST focusable,
   *      which is this panel's own close button,
   *   3. so typing a SPACE activated that button and shut the panel.
   *
   * Any page holding its form state in the PAGE rather than in a child form
   * re-renders on every keystroke, so "Pay off Chase Amazon" closed the panel
   * at its first space. Goals is the page that surfaced it; the other five
   * callers escaped only by accident of where they keep their state, which is
   * not a property to rely on. See AUDIT D-186.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter(el => !el.hasAttribute('disabled'));

      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  /**
   * Focus moves into the panel ONCE PER OPENING, never on a re-render. Keyed on
   * `isOpen` alone and deliberately separate from the listener effect above: a
   * panel that re-takes focus while somebody is typing is the bug described
   * there, and keeping the two effects apart means a future dependency added to
   * the listener cannot resurrect it.
   */
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      /*
       * *** NEVER THE CLOSE BUTTON, WHICH IS THE FIRST FOCUSABLE IN THE DOM. ***
       * This used to focus `querySelector(FOCUSABLE)`, and the header's "Close
       * panel" button is the first match. Two things went wrong with that:
       *
       *   1. It is the wrong control to hand somebody who just opened a form —
       *      a SPACE or ENTER, which they are about to type, dismisses it.
       *   2. It runs inside `requestAnimationFrame`, so on a slow render it
       *      landed MID-TYPING: focus jumped out of the name field and the next
       *      space in "Pay off my cards" closed the panel.
       *
       * (2) is why this was a Heisenbug — the same test passed alone and failed
       * in its file, because the frame fired before typing in one and during it
       * in the other. Skipping the dismiss control removes both: the first
       * FIELD gets focus, and a space there is just a space.
       */
      const candidates = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => !el.hasAttribute('disabled')
                     && el.getAttribute('aria-label') !== CLOSE_LABEL);
      // The panel itself as the fallback, so an empty panel still traps focus
      // rather than leaving it on whatever was behind the backdrop.
      (candidates[0] ?? panel).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--overlay-bg)',
          backdropFilter: 'blur(4px)',
          zIndex: 999,
          animation: 'fadeIn 0.3s ease-out'
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: width,
          maxWidth: '100vw',
          background: 'var(--bg-secondary)',
          boxShadow: 'var(--card-shadow)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.3s ease-out',
          borderLeft: '1px solid var(--border-light)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card)'
          }}
        >
          <h2
            id={titleId}
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <X size={20} style={{ color: 'var(--accent-red)' }} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'scroll',
            overflowX: 'hidden',
            padding: '24px',
            minHeight: 0,
            maxHeight: '100%',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {children}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>,
    document.body
  );
};
