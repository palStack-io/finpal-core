import React from 'react';
import { Link } from 'react-router-dom';
import { MountainSilhouette } from '../../components/MountainSilhouette';
import { heightForMagnitude } from '../../utils/mountainGeometry';
import { formatMoney } from '../../styles/money';
import type { LearnRange, RangeScaleSide } from '../../types/learnpal';

/**
 * "Your range" on the goals page — option A, a compact range rather than a
 * thumbnail.
 *
 * *** learnPal ONLY. With the module off this component is never rendered: no
 * banner, no border, nothing. *** The goal cards keep their mountains, because
 * those are core.
 *
 * *** BOTH SIDES PRINT THEIR OWN UNIT, AND THERE IS A DIVIDER BETWEEN THEM. ***
 * At banner size the two clusters sit close enough that somebody could read a
 * Rainier as "bigger than" a Ben Nevis across the gap — and the two scales share
 * no unit, so that comparison is meaningless. The units are what stop it. A
 * divider is needed at this size and was not at thumbnail size.
 */

const MAX_PX = 54;

/*
 * *** EVERY LINK HERE CARRIES AN EXPLICIT COLOUR, AND IT HAS TO. *** This app
 * has no global `a { }` rule and no link variable, so an unstyled `<Link>` falls
 * back to the USER AGENT's blue -- `#0000ee`, which measures 9.13:1 on the light
 * card and 1.72:1 on the dark one. The contrast walk caught exactly that as a
 * NEW failing pair (`#0000ee|#16241a`) on the first run after this component
 * existed, which is the ratchet doing its job.
 *
 * `--g-ink` is already theme-aware (#166534 light, #5fce8b dark) and measures
 * 6.92:1 and 8.21:1 on the two card surfaces, so it is the right existing token
 * rather than a new one.
 */

const sideHeading: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
};

const Cluster: React.FC<{ side: RangeScaleSide; scale: 'cost' | 'build' }> = ({ side, scale }) => {
  const colour = scale === 'cost' ? 'var(--peak-cost)' : 'var(--peak-build)';
  const currency = side.peaks[0]?.currency_code;
  return (
    <div style={{ flex: 1, minWidth: 0 }} data-testid={`banner-side-${scale}`}>
      <div style={{ ...sideHeading, color: colour }}>{side.heading}</div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8, height: MAX_PX,
        marginTop: 6, overflow: 'hidden',
      }}>
        {side.peaks.slice(0, 6).map((p) => (
          <MountainSilhouette
            key={p.goal_id}
            band={p.peak.band}
            height={heightForMagnitude(p.peak.magnitude, p.peak.scale)}
            scale={p.peak.scale}
            unmeasured={p.peak.unmeasured}
            maxPixelHeight={MAX_PX}
            decorative
          />
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
        <strong style={{ color: 'var(--text-primary)' }}>
          {currency ? formatMoney(side.total, { currency }) : side.total}
        </strong>{' '}
        {side.unit}
      </div>
    </div>
  );
};

export const RangeBanner: React.FC<{ range: LearnRange }> = ({ range }) => {
  const currency = range.cost.peaks[0]?.currency_code
    ?? range.build.peaks[0]?.currency_code;
  if (range.cost.peaks.length === 0 && range.build.peaks.length === 0) return null;

  // The first `next` across every peak, so the header can name something
  // concrete to work towards rather than only counting what is done.
  const next = [...range.cost.peaks, ...range.build.peaks]
    .map((p) => p.strip.next).find((n) => n != null) ?? null;

  return (
    <div
      data-testid="range-banner"
      style={{
        border: '1px solid var(--border-light)', borderRadius: 16,
        background: 'var(--bg-secondary)', marginBottom: 20, overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: 12, padding: '12px 16px 0', flexWrap: 'wrap',
      }}>
        <div>
          <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>
            Your range
          </strong>{' '}
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            {range.lessons.read} of {range.lessons.total} lessons read
            {next && (
              <>
                {' · next at '}
                {next.unlock_at_progress !== null
                  ? `${Math.round(next.unlock_at_progress * 100)}%: `
                  : ''}
                <strong style={{ color: 'var(--text-primary)' }}>{next.title}</strong>
              </>
            )}
          </span>
        </div>
        <Link to="/learnpal/range" style={{ fontSize: 13, color: 'var(--g-ink)' }}>
          Open learnPal
        </Link>
      </div>

      <div style={{ display: 'flex', padding: '10px 16px 4px' }}>
        <Cluster side={range.cost} scale="cost" />
        <div
          aria-hidden="true"
          style={{
            width: 1, alignSelf: 'stretch', margin: '0 16px',
            background: 'var(--border-light)',
          }}
        />
        <Cluster side={range.build} scale="build" />
      </div>

      {/* The ground as a full-width strip along the bottom — under both sides,
          because it is under both. */}
      <div style={{
        borderTop: '1px solid var(--border-light)',
        background: 'var(--surface-hover)',
        padding: '7px 16px', fontSize: 12,
        color: 'var(--text-secondary)',
      }}>
        The ground:{' '}
        <strong style={{ color: 'var(--text-primary)' }}>
          {currency ? formatMoney(range.ground.total, { currency })
                    : range.ground.total}
        </strong>{' '}
        a month before you climb anything
      </div>
    </div>
  );
};

export default RangeBanner;
