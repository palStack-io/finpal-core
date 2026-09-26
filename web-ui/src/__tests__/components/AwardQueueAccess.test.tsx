/**
 * The award queue for keyboard and screen-reader users, and a long queue.
 *
 * Found on the premium demo 2026-09-26 and ported as the generic half (owner:
 * core gets the queue fixes, not the mascot): the award sat dozens of Tabs from
 * the top of the page with no key to close it, each card carried its own live
 * region created already full (often not announced), and a returning user with
 * a dozen awards had to click a dozen times.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/CoinAwardContext', () => ({ useCoinAwards: vi.fn() }));
vi.mock('../../store/authStore', () => ({ useAuthStore: vi.fn() }));

import { CoinAwardContainer } from '../../components/coins/CoinAwardContainer';
import { CoinAward } from '../../components/coins/CoinAward';
import { useCoinAwards } from '../../contexts/CoinAwardContext';
import { useAuthStore } from '../../store/authStore';

const award = { slug: 'has_a_goal', coins: 1500, revealed: 'Holiday fund joins your range.', teach: null };
const asUser = () =>
  vi.mocked(useAuthStore).mockImplementation(((sel: (s: unknown) => unknown) =>
    sel({ user: { id: 'u1' } })) as never);
const withQueue = (current: unknown, remaining: number) => {
  const api = { current, remaining, dismiss: vi.fn(), dismissAll: vi.fn(), loadUnseen: vi.fn() };
  vi.mocked(useCoinAwards).mockReturnValue(api as never);
  return api;
};
const draw = () => render(<MemoryRouter><CoinAwardContainer /></MemoryRouter>);

describe('the award queue — access', () => {
  it('keeps ONE live region mounted with nothing to say, then writes the award into it', () => {
    asUser();
    withQueue(null, 0);
    const { rerender } = draw();
    const live = screen.getByTestId('award-live');
    expect(live).toHaveAttribute('role', 'status');
    expect(live).toHaveTextContent(/^$/);
    withQueue(award, 2);
    rerender(<MemoryRouter><CoinAwardContainer /></MemoryRouter>);
    expect(screen.getByTestId('award-live')).toBe(live);
    expect(live).toHaveTextContent('1,500 coins. Holiday fund joins your range. 2 more waiting.');
  });

  it('the card carries no live region of its own', () => {
    const { container } = render(<CoinAward coins={10} revealed="x" />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('is a named landmark', () => {
    asUser();
    withQueue(award, 0);
    draw();
    expect(screen.getByRole('region', { name: 'Coins earned' })).toBeInTheDocument();
  });

  it('Escape dismisses, but not while a dialog is open', () => {
    asUser();
    let api = withQueue(award, 0);
    const { unmount } = draw();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(api.dismiss).toHaveBeenCalledTimes(1);
    unmount();
    api = withQueue(award, 0);
    render(<MemoryRouter><div role="dialog" /><CoinAwardContainer /></MemoryRouter>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(api.dismiss).not.toHaveBeenCalled();
  });

  it('offers Dismiss all only when more are waiting', () => {
    asUser();
    const api = withQueue(award, 4);
    const { rerender } = draw();
    expect(screen.getByTestId('award-dismiss-all')).toHaveTextContent('Dismiss all 5');
    fireEvent.click(screen.getByTestId('award-dismiss-all'));
    expect(api.dismissAll).toHaveBeenCalledTimes(1);
    withQueue(award, 0);
    rerender(<MemoryRouter><CoinAwardContainer /></MemoryRouter>);
    expect(screen.queryByTestId('award-dismiss-all')).not.toBeInTheDocument();
  });

  it('paints nothing at all for a signed-out visitor, even with an award queued', () => {
    vi.mocked(useAuthStore).mockImplementation(((sel: (s: unknown) => unknown) =>
      sel({ user: null })) as never);
    withQueue(award, 3);
    const { container } = draw();
    expect(container).toBeEmptyDOMElement();
  });
});
