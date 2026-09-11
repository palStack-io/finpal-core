import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { MountainSilhouette } from '../../../components/MountainSilhouette';
import { GearIcon } from '../../../components/GearIcon';
import { heightForMagnitude } from '../../../utils/mountainGeometry';
import { peakColorVar, peakSubline } from '../../../utils/peakCopy';
import { formatMoney } from '../../../styles/money';
import { pageContainerStyle, pageMaxWidthStyle } from '../../../styles/layoutStyles';
import { learnpalService } from '../service';
import { apiErrorMessage } from '../../../utils/apiError';
import type { LearnRange, RangePeak, RangeScaleSide } from '../../../types/learnpal';

/**
 * Your range — layout A.
 *
 * *** THE ONLY SCREEN THAT SHOWS BOTH SCALES AND THE GROUND IN ONE LOOK, WHICH
 * IS THE ARGUMENT OF THE WHOLE DESIGN. *** Two scales side by side over one
 * shared ground strip, each with its OWN heading and its OWN total.
 *
 * *** THE UNITS ARE PRINTED ON EACH SIDE AND THE DIVIDER IS LOAD-BEARING. ***
 * `cost` is monthly interest and `build` is distance remaining; they share no
 * unit, so at this size somebody could otherwise read a Rainier as "bigger
 * than" a Ben Nevis across the gap. The colour carries the rule, the unit says
 * it, and the divider stops the eye running across.
 */

const MAX_PEAK_PX = 148;

const headingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
};

const totalStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  lineHeight: 1.1,
  fontFamily: "'Bricolage Grotesque', sans-serif",
};

const mutedStyle: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' };

const Peak: React.FC<{ entry: RangePeak }> = ({ entry }) => {
  const { peak } = entry;
  const money = (amount: number) =>
    formatMoney(amount, { currency: entry.currency_code });
  const height = heightForMagnitude(peak.magnitude, peak.scale);

  return (
    <div
      data-testid={`range-peak-${entry.goal_id}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 6, minWidth: 96, maxWidth: 160,
      }}
    >
      {/* Bottom-aligned so every peak in a cluster stands on one line -- a
          mountain is anchored to its ground, and a row of centred silhouettes
          reads as floating shapes rather than as a range. */}
      <div style={{
        height: MAX_PEAK_PX, display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center',
      }}>
        <MountainSilhouette
          band={peak.band}
          height={height}
          scale={peak.scale}
          unmeasured={peak.unmeasured}
          maxPixelHeight={MAX_PEAK_PX}
          title={peak.mountain
            ? `${entry.name}: ${peak.mountain.name}, ${peak.mountain.elevation_m} m`
            : `${entry.name}: no rate recorded`}
        />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {entry.name}
        </div>
        <div style={{ ...mutedStyle, fontSize: 12 }}>
          {peak.unmeasured
            ? <em>No rate recorded</em>
            : peakSubline(peak, money)}
        </div>
        {/* The strip, in its smallest form: the gear earned here and what is
            next. Layout A on the goal card is the same information. */}
        {entry.strip.gear.length > 0 && (
          <div style={{
            display: 'flex', gap: 3, justifyContent: 'center', marginTop: 5,
          }}>
            {entry.strip.gear.map((g) => (
              <span
                key={g.milestone_slug}
                title={`${g.title}${g.earned ? '' : ' — not yet'}`}
                style={{ opacity: g.earned ? 1 : 0.3, lineHeight: 0 }}
              >
                <GearIcon slug={g.slug ?? g.milestone_slug} size={16} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Side: React.FC<{ side: RangeScaleSide; scale: 'cost' | 'build' }> = ({ side, scale }) => {
  const colour = scale === 'cost' ? 'var(--peak-cost)' : 'var(--peak-build)';
  const currency = side.peaks[0]?.currency_code;
  return (
    <div style={{ flex: 1, minWidth: 0 }} data-testid={`range-side-${scale}`}>
      <div style={{ ...headingStyle, color: colour }}>{side.heading}</div>
      <div style={{ ...totalStyle, color: 'var(--text-primary)', marginTop: 4 }}>
        {currency ? formatMoney(side.total, { currency }) : side.total}
      </div>
      {/* *** THE UNIT IS NOT DECORATION. *** It is what stops one side's total
          being read against the other's; they share no unit. */}
      <div style={mutedStyle}>{side.unit}</div>

      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
        gap: 18, marginTop: 18, flexWrap: 'wrap',
      }}>
        {side.peaks.length === 0
          ? <p style={{ ...mutedStyle, fontStyle: 'italic' }}>
              Nothing on this side yet.
            </p>
          : side.peaks.map((p) => <Peak key={p.goal_id} entry={p} />)}
      </div>
    </div>
  );
};

export const Range: React.FC = () => {
  const [range, setRange] = useState<LearnRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRange(await learnpalService.getRange());
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load your range.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
        <Loader2 size={20} className="animate-spin" aria-label="Loading your range" />
      </div>
    );
  }

  // `null` means the module is not installed, which is not an error state.
  if (!range) {
    return (
      <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
        <h1 className="page-title">Your range</h1>
        <p className="fp-hint">learnPal is not enabled on this instance.</p>
      </div>
    );
  }

  const currency = range.cost.peaks[0]?.currency_code
    ?? range.build.peaks[0]?.currency_code;
  const nothingYet = range.cost.peaks.length === 0 && range.build.peaks.length === 0;

  return (
    <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title">Your range</h1>
        <p className="fp-hint">
          Every goal you have, drawn at the size of what it asks of you —
          and the ground you stand on while you climb.
        </p>
      </div>

      {error && <div role="alert" style={{ color: 'var(--danger-text)' }}>{error}</div>}

      {nothingYet ? (
        <p style={{ ...mutedStyle, fontStyle: 'italic' }}>
          No goals yet. <Link to="/goals" style={{ color: 'var(--g-ink)' }}>Add one</Link> and it appears here as a
          mountain.
        </p>
      ) : (
        <div style={{
          border: '1px solid var(--border-light)', borderRadius: 18,
          background: 'var(--bg-secondary)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', gap: 0, padding: '20px 22px 8px' }}>
            <Side side={range.cost} scale="cost" />
            {/* *** THE DIVIDER IS REQUIRED AT THIS SIZE AND WAS NOT AT
                THUMBNAIL SIZE. *** Without it the two clusters read as one
                range, which is the single comparison the design rules out. */}
            <div
              aria-hidden="true"
              style={{
                width: 1, alignSelf: 'stretch', margin: '0 22px',
                background: 'var(--border-light)',
              }}
            />
            <Side side={range.build} scale="build" />
          </div>

          {/* *** THE GROUND IS ONE FULL-WIDTH STRIP UNDER BOTH SIDES, BECAUSE
              IT IS UNDER BOTH. *** You stand on it before you climb either
              one, and drawing it twice would make it look like two different
              obligations. */}
          <div
            data-testid="range-ground"
            style={{
              borderTop: '1px solid var(--border-light)',
              background: 'var(--surface-hover)',
              padding: '12px 22px',
              display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'baseline',
            }}
          >
            <span style={{ ...headingStyle, color: 'var(--text-secondary)' }}>
              The ground
            </span>
            <strong style={{ color: 'var(--text-primary)', fontSize: 15 }}>
              {currency ? formatMoney(range.ground.total, { currency })
                        : range.ground.total}
            </strong>
            <span style={mutedStyle}>
              a month before you climb anything —{' '}
              {currency ? formatMoney(range.ground.recurring, { currency })
                        : range.ground.recurring}{' '}
              recurring and{' '}
              {currency ? formatMoney(range.ground.minimums, { currency })
                        : range.ground.minimums}{' '}
              of card minimums
            </span>
          </div>
        </div>
      )}

      <div style={{
        marginTop: 18, display: 'flex', gap: 14, alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <span style={mutedStyle}>
          {range.lessons.read} of {range.lessons.total} lessons read
        </span>
        <Link to="/learnpal/lessons" style={{ color: 'var(--g-ink)' }}>
          See all lessons
        </Link>
      </div>
    </div>
  );
};

export default Range;
