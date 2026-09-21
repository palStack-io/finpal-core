/**
 * Two windows the user picks, for Compare.
 *
 * The presets are ROLLING — "the last 30 days against the 30 before" — and
 * cannot express "March against September", which is the question this was
 * added for.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ComparePicker } from '../../components/analytics/ComparePicker';

const fill = (labels: Record<string, string>) => {
  Object.entries(labels).forEach(([label, value]) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
};

describe('the compare picker', () => {
  it('applies both windows at once, on submit', () => {
    /* *** ON SUBMIT, NOT PER KEYSTROKE. *** A date input emits a value on the
       way to being typed, so fetching per change fires a request per digit
       and briefly asks about a date the user never meant. */
    const onApply = vi.fn();
    render(<ComparePicker busy={false} active={false} onApply={onApply} onReset={() => {}} />);

    fill({ 'Period A from': '2026-03-01' });
    expect(onApply).not.toHaveBeenCalled();

    fill({
      'Period A to': '2026-03-31',
      'Period B from': '2026-09-01',
      'Period B to': '2026-09-30',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(onApply).toHaveBeenCalledWith(
      { start: '2026-03-01', end: '2026-03-31' },
      { start: '2026-09-01', end: '2026-09-30' },
    );
  });

  it('*** REFUSES A REVERSED RANGE RATHER THAN SWAPPING IT ***', () => {
    /* A reversed range is as likely to be the wrong date typed as the right
       dates in the wrong order — and the server refuses it too, so silently
       swapping here would make the client and the API disagree about what is
       valid. */
    const onApply = vi.fn();
    render(<ComparePicker busy={false} active={false} onApply={onApply} onReset={() => {}} />);

    fill({
      'Period A from': '2026-03-31', 'Period A to': '2026-03-01',
      'Period B from': '2026-09-01', 'Period B to': '2026-09-30',
    });

    expect(screen.getByRole('alert').textContent).toMatch(/cannot end before it starts/);
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('cannot be submitted half-filled', () => {
    // One real window against a stale one, labelled as the pair the user
    // chose, is worse than no comparison.
    const onApply = vi.fn();
    render(<ComparePicker busy={false} active={false} onApply={onApply} onReset={() => {}} />);
    fill({ 'Period A from': '2026-03-01' });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('offers a way back to the presets only once something is applied', () => {
    const { rerender } = render(
      <ComparePicker busy={false} active={false} onApply={() => {}} onReset={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Back to presets' })).toBeNull();

    rerender(<ComparePicker busy={false} active onApply={() => {}} onReset={() => {}} />);
    expect(screen.getByRole('button', { name: 'Back to presets' })).toBeTruthy();
  });
});
