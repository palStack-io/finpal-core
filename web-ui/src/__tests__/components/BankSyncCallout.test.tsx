/**
 * The Accounts page had no mention that automatic bank sync exists — it lives in
 * Settings → Integrations and nothing pointed there. This is the signpost, and these
 * tests cover the two ways a signpost goes wrong: pointing somewhere useless, and
 * pointing nowhere.
 *
 * `SIMPLEFIN_ENABLED` defaults to **false** on the server, so a self-hoster who has not
 * enabled it must not be sent to a panel that only says "not available"; and someone
 * already connected does not need directions to the thing they have done.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { BankSyncCallout } from '../../components/accounts/BankSyncCallout';
import { useAuthStore } from '../../store/authStore';

const getSimpleFinStatus = vi.fn();

vi.mock('../../services/accountService', () => ({
  accountService: {
    getSimpleFinStatus: (...args: unknown[]) => getSimpleFinStatus(...args),
  },
}));

function signIn(features?: { simplefin: boolean; investments: boolean }) {
  act(() => {
    useAuthStore.getState().login(
      {
        id: 't@t.com',
        email: 't@t.com',
        name: 'T',
        default_currency_code: 'USD',
        hasCompletedOnboarding: true,
      } as never,
      'token',
      'refresh',
      undefined,
      features,
    );
  });
}

function renderCallout() {
  return render(
    <MemoryRouter>
      <BankSyncCallout />
    </MemoryRouter>
  );
}

describe('BankSyncCallout', () => {
  beforeEach(() => {
    getSimpleFinStatus.mockReset();
    getSimpleFinStatus.mockResolvedValue({ connected: false });
  });

  afterEach(() => {
    localStorage.clear();
    act(() => { useAuthStore.getState().logout(); });
  });

  it('points an unconnected user at Settings → Integrations', async () => {
    signIn({ simplefin: true, investments: true });
    renderCallout();

    expect(await screen.findByText(/Connect your bank automatically/i)).toBeTruthy();
    expect(screen.getByText(/Settings → Integrations/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Set up bank sync/i })).toBeTruthy();
  });

  it('says nothing when the server has SimpleFin switched off', async () => {
    signIn({ simplefin: false, investments: true });
    const { container } = renderCallout();

    await waitFor(() => {
      expect(getSimpleFinStatus).not.toHaveBeenCalled();
    });
    expect(container.textContent).toBe('');
  });

  it('disappears once the user is connected', async () => {
    getSimpleFinStatus.mockResolvedValue({ connected: true });
    signIn({ simplefin: true, investments: true });
    const { container } = renderCallout();

    await waitFor(() => expect(getSimpleFinStatus).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('still shows when the status request fails', async () => {
    // The failure mode worth pinning: treating an error as "connected" would erase the
    // only pointer to the feature over a network blip, and the user would never see it
    // again.
    getSimpleFinStatus.mockRejectedValue(new Error('network'));
    signIn({ simplefin: true, investments: true });
    renderCallout();

    expect(await screen.findByText(/Connect your bank automatically/i)).toBeTruthy();
  });

  it('spells out what the user has to go and get', async () => {
    signIn({ simplefin: true, investments: true });
    renderCallout();

    const reveal = await screen.findByRole('button', { name: /What do I need/i });
    act(() => { reveal.click(); });

    // Keyed to the two facts a user cannot guess and that decide whether they bother:
    // it costs money, and the token is single-use.
    const steps = screen.getByRole('list').textContent || '';
    expect(steps).toMatch(/paid service/i);
    expect(steps).toMatch(/only once/i);
  });
});
