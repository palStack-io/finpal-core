/**
 * The flow diagram answers a follow-up question, and answers it honestly.
 *
 * *** THE PANEL MUST SUM TO THE BAND THAT WAS CLICKED. *** That is the single
 * promise a drill-down makes, and it is the one this project has broken in
 * every neighbouring shape: a caption over figures it does not describe. The
 * node therefore sends the exact category ids it merged — not one id, which
 * misses a housemate's same-named category, and not a parent rolled up over
 * its children, which the diagram never counted.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { incomeFlow } from '../../utils/incomeFlow';
import IncomeFlowChart from '../../components/analytics/IncomeFlowChart';
import { SliceBreakdown } from '../../components/analytics/SliceBreakdown';

vi.mock('../../services/api/spendingSummary', () => ({
  spendingSummaryApi: { get: vi.fn() },
}));
import { spendingSummaryApi } from '../../services/api/spendingSummary';

const flowOf = (ids?: number[][]) => incomeFlow(
  [{ name: 'Salary', amount: 3000 }],
  [
    { name: 'Groceries', amount: 500, ids: ids?.[0] },
    { name: 'Rent', amount: 1200, ids: ids?.[1] },
  ],
)!;

const money = (n: number) => `$${n.toFixed(2)}`;

describe('a spending slice can be opened', () => {
  it('is a focusable BUTTON, not a click handler on a shape', () => {
    /* Same rule the range peaks learned: a mouse-only control on a chart does
       not exist on a phone or to a keyboard. */
    render(<IncomeFlowChart flow={flowOf([[1], [2]])} format={money}
                            onOpenSlice={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => expect(b.getAttribute('tabindex')).toBe('0'));
  });

  it('opens on Enter and on Space, not only on click', () => {
    const onOpen = vi.fn();
    render(<IncomeFlowChart flow={flowOf([[1], [2]])} format={money}
                            onOpenSlice={onOpen} />);
    const first = screen.getAllByRole('button')[0];
    fireEvent.keyDown(first, { key: 'Enter' });
    fireEvent.keyDown(first, { key: ' ' });
    fireEvent.click(first);
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('*** OFFERS NO CONTROL FOR A NODE THE SERVER GAVE NO IDS FOR ***', () => {
    /* A backend predating `ids` sends none. Opening such a node would mean
       guessing which rows it meant — so it stays a picture, which is the only
       honest degradation. */
    render(<IncomeFlowChart flow={flowOf()} format={money} onOpenSlice={() => {}} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('draws no controls at all when nothing can be opened', () => {
    render(<IncomeFlowChart flow={flowOf([[1], [2]])} format={money} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('the breakdown asks for exactly the slice it was opened from', () => {
  /* *** CLEARED, OR `mock.calls[0]` IS THE PREVIOUS TEST'S CALL. *** Without
     this the second assertion below read the first test's arguments and
     passed on them — a test green for a reason that has nothing to do with
     what it claims to check. */
  beforeEach(() => { vi.mocked(spendingSummaryApi.get).mockClear(); });

  it('sends EVERY id the node merged, comma separated', async () => {
    /* Axios serialises an array as `category_id[]=`, which Flask's `getlist`
       does not match — the filter would vanish and the panel would show the
       whole range while claiming to show one slice. */
    vi.mocked(spendingSummaryApi.get).mockResolvedValue({
      groups: [{ key: 'Costco', label: 'Costco', total: 500, count: 2 }],
      total: 500, count: 2, start_date: 'x', end_date: 'y', group_by: 'merchant',
    } as never);

    const node = { id: 'out-0', label: 'Groceries', value: 500, side: 'out' as const,
                   categoryIds: [7, 9] };
    render(<SliceBreakdown node={node} start="2026-03-01" end="2026-03-31"
                           format={money} onClose={() => {}} />);

    await waitFor(() => expect(spendingSummaryApi.get).toHaveBeenCalled());
    expect(vi.mocked(spendingSummaryApi.get).mock.calls[0][0]).toMatchObject({
      group_by: 'merchant', category_id: '7,9',
    });
  });

  it('*** ASKS FOR UNCATEGORISED AS 0, NOT AS NOTHING ***', async () => {
    /* An empty id list is the Uncategorised slice — a real band, and the one a
       reader most wants explained. Sending no filter would return the whole
       range instead: the loudest possible wrong answer. */
    vi.mocked(spendingSummaryApi.get).mockResolvedValue({
      groups: [], total: 0, count: 0, start_date: 'x', end_date: 'y', group_by: 'merchant',
    } as never);

    const node = { id: 'out-3', label: 'Uncategorised', value: 80, side: 'out' as const,
                   categoryIds: [] };
    render(<SliceBreakdown node={node} start="2026-03-01" end="2026-03-31"
                           format={money} onClose={() => {}} />);

    await waitFor(() => expect(spendingSummaryApi.get).toHaveBeenCalled());
    expect(vi.mocked(spendingSummaryApi.get).mock.calls[0][0]).toMatchObject({
      category_id: '0',
    });
  });

  it('never calls these rows merchants, and shows the SERVER total', async () => {
    vi.mocked(spendingSummaryApi.get).mockResolvedValue({
      groups: [
        { key: 'Costco', label: 'Costco', total: 300, count: 1 },
        { key: 'Rent Payment', label: 'Rent Payment', total: 200, count: 1 },
      ],
      total: 500, count: 2, start_date: 'x', end_date: 'y', group_by: 'merchant',
    } as never);

    const node = { id: 'out-0', label: 'Groceries', value: 500, side: 'out' as const,
                   categoryIds: [7] };
    const { container } = render(
      <SliceBreakdown node={node} start="2026-03-01" end="2026-03-31"
                      format={money} onClose={() => {}} />);

    await screen.findByTestId('slice-row-Costco');
    // "Rent Payment" is not a company; the server's own docstring forbids
    // calling this grouping merchants, and the UI must not either.
    expect(container.textContent).not.toMatch(/merchant/i);
    expect(container.textContent).not.toMatch(/compan/i);
    // The total is the server's, and it equals the slice.
    expect(container.textContent).toContain('$500.00');
  });
});
