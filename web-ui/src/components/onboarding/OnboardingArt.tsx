import React from 'react';

/**
 * The onboarding's illustrations: one dusk ridge scene behind every screen and
 * four small glyphs for the four things the game screen names.
 *
 * *** FIXED COLOURS, NOT THEME TOKENS, ON PURPOSE. *** Onboarding is a dusk
 * "arrival" screen in both themes (see `onboardingContrast.test.ts`), so these
 * are literals measured against that surface, never `var(--...)`. Every shape is
 * decorative: `aria-hidden`, no text, no information that is not also in words.
 */
export const GOLD = '#f4c95d';
export const GOLD_DEEP = '#b7791f';

/** The sky, ridges and a dotted gold route, pinned to the bottom of the viewport. */
export const RidgeScene: React.FC = () => (
  <svg
    aria-hidden="true"
    focusable="false"
    data-onboarding-art="ridge-scene"
    viewBox="0 0 1200 420"
    preserveAspectRatio="xMidYMax slice"
    style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, width: '100%',
      height: 'min(46vh, 420px)', pointerEvents: 'none', zIndex: 1,
    }}
  >
    <defs>
      <radialGradient id="onb-glow" cx="50%" cy="100%" r="70%">
        <stop offset="0" stopColor={GOLD} stopOpacity="0.5" />
        <stop offset="1" stopColor={GOLD} stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="1200" height="420" fill="url(#onb-glow)" />
    <g fill={GOLD}>
      <circle cx="140" cy="60" r="2" /><circle cx="330" cy="30" r="1.5" />
      <circle cx="560" cy="80" r="1.6" /><circle cx="850" cy="40" r="2" />
      <circle cx="1040" cy="90" r="1.5" /><circle cx="1130" cy="30" r="1.8" />
    </g>
    <path d="M0 270 L150 190 L270 250 L430 150 L580 255 L760 170 L920 260 L1060 200 L1200 250 V420 H0Z"
      fill="#1f5a40" opacity="0.8" />
    <path d="M0 320 L220 240 L400 310 L650 80 L900 300 L1060 250 L1200 300 V420 H0Z" fill="#14402e" />
    <path d="M650 80 L600 160 L632 148 L650 170 L676 144 L712 162Z" fill="#fbe9b4" />
    <path d="M650 80 L900 300 L700 306Z" fill="#000" opacity="0.2" />
    <path d="M0 370 L260 330 L520 366 L820 322 L1200 366 V420 H0Z" fill="#0c2a1e" />
    <path d="M640 380 C 590 330, 700 300, 640 240 S 630 140, 650 92"
      fill="none" stroke={GOLD} strokeWidth="3" strokeDasharray="4 9" strokeLinecap="round" opacity="0.85" />
    <g fill={GOLD}>
      <circle cx="612" cy="318" r="8" /><circle cx="668" cy="262" r="8" /><circle cx="636" cy="188" r="8" />
    </g>
  </svg>
);

/** A coin: the real thing coins are drawn as elsewhere in the app, a gold disc with a ring. */
export const CoinDisc: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="9" fill={GOLD} stroke={GOLD_DEEP} strokeWidth="1.5" />
    <circle cx="10" cy="10" r="5.5" fill="none" stroke={GOLD_DEEP} strokeWidth="1.3" />
  </svg>
);

export const MountainGlyph: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24">
    <path d="M1 21 L9 6 L14 14 L17 10 L23 21Z" fill="#6fa387" />
    <path d="M9 6 L6.8 10.2 L9 9.2 L11 10.4Z" fill="#ffffff" />
  </svg>
);

/** Kit is gear you buy with coins; a compass says "equipment" without a store. */
export const CompassGlyph: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9.5" stroke="#f3f7ef" strokeWidth="1.6" />
    <path d="M12 4.5 L15 12 L12 19.5 L9 12Z" fill="#c2492a" />
    <path d="M12 4.5 L15 12 L9 12Z" fill="#f3f7ef" />
  </svg>
);

export const BadgeGlyph: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9.5" stroke="#6ee7a0" strokeWidth="1.8" />
    <path d="M7.5 12.5 L10.7 15.5 L16.5 8.8" stroke="#6ee7a0" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Two example peaks for the Mountains screen: a steep clay one and a low sage one. */
export const PeakExamples: React.FC = () => (
  <svg aria-hidden="true" focusable="false" data-onboarding-art="peak-examples"
    width="150" height="64" viewBox="0 0 150 64" style={{ margin: '0.25rem 0 0.75rem' }}>
    <path d="M4 62 L44 6 L84 62Z" fill="#c2623e" />
    <path d="M44 6 L34 21 L41 18 L44 24 L49 17 L55 22Z" fill="#ffffff" />
    <path d="M92 62 L104 36 H138 L148 62Z" fill="#6fa387" />
  </svg>
);
