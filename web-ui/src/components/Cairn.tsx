import React from 'react';

/**
 * A cairn: the stone marker that means *someone came this way*.
 *
 * *** IT IS BINARY, DELIBERATELY, AND THAT IS THE WHOLE DESIGN CONSTRAINT. ***
 * A cairn is present when an act on that page is still open to you and simply
 * gone when there is nothing left to do there. **No stones accumulate.** A
 * marker that grew with progress would be decision 5's denominator wearing a
 * hat — a score finPal chose rather than a target the user did.
 *
 * *** AND IT MUST CLEAR, OR IT STOPS MEANING ANYTHING. *** A permanent marker
 * on every page reads as decoration within a day. `Sidebar`'s own Review badge
 * carries the same rule in its own words: a permanent "0" would nag about a
 * job already done.
 *
 * *** THIS IS HOW THE METAPHOR REACHES ANALYTICS AND SETTINGS WITHOUT PAYING
 * FOR ATTENDANCE. *** §5.2 keeps those pages earning nothing; the nav can
 * still tell you, from anywhere, where there is work — with no score in it.
 */
export const Cairn: React.FC<{ size?: number; title?: string }> = ({
  size = 12,
  title,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    data-testid="cairn"
    style={{ flexShrink: 0 }}
  >
    {/* Three stones, largest at the base — a cairn, not a stack of dots. The
        shapes are fills taking `currentColor`, so the marker inherits whatever
        it sits in and cannot go invisible in one theme (D-60's class). */}
    <ellipse cx="6" cy="10" rx="4.5" ry="1.6" fill="currentColor" />
    <ellipse cx="6" cy="6.6" rx="3.2" ry="1.4" fill="currentColor" />
    <ellipse cx="6" cy="3.6" rx="2" ry="1.2" fill="currentColor" />
  </svg>
);
