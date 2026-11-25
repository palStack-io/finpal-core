/** The one reading of a goal's mountain (Harun 2026-11-20): sized by the goal, how far up is progress. */
import { describe, expect, it } from 'vitest';
import { goalFinished, goalPeakHeight, goalProgress } from '../../utils/goalPeak';
import { heightForMagnitude } from '../../utils/mountainGeometry';

const peak = (o: object) => ({ scale: 'build', magnitude: 100, unmeasured: false, band: 3, mountain: null,
  hardest_band: null, hardest_mountain: null, ...o }) as never;

describe('a goal peak', () => {
  it('is sized by the goal (size), not by what is left', () => {
    expect(goalPeakHeight(peak({ size: 16000, magnitude: 8000 }))).toBe(heightForMagnitude(16000, 'build'));
  });
  it('a debt is sized by the amount to clear on the same money ladder, not by its interest', () => {
    expect(goalPeakHeight(peak({ scale: 'cost', size: 1650, magnitude: 13.33 }))).toBe(heightForMagnitude(1650, 'build'));
  });
  it('is finished only when the server\'s progress reaches 1', () => {
    expect(goalFinished({ progress: 1, peak: peak({ magnitude: 0 }) })).toBe(true);
    expect(goalFinished({ progress: 0.4, peak: peak({ magnitude: 0 }) })).toBe(false);
  });
  it('an unmeasured goal is never "finished", whatever its magnitude says', () => {
    expect(goalFinished({ progress: 0, peak: peak({ unmeasured: true, magnitude: null }) })).toBe(false);
    expect(goalFinished({ progress: 1, peak: peak({ unmeasured: true, magnitude: null }) })).toBe(false);
  });
  it('how far up is the progress, clamped for drawing', () => {
    expect(goalProgress({ progress: 0.375 })).toBe(0.375);
    expect(goalProgress({ progress: 1.4 })).toBe(1);
    expect(goalProgress({ progress: -0.2 })).toBe(0);
  });
});
