/*
 * *** A HELPER'S OWN TEST IS NOT PROOF OF ITS ADOPTION — D-106. ***
 * `settingsRailTagsRefuseToGuess.test.ts` proves `railTag` returns the right
 * string and refuses to guess. It cannot prove that Settings renders it, and
 * three screens once bypassed a helper while 494 tests stayed green. So this
 * file renders the PAGE and reads the rail.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { Settings } from '../../pages/Settings';
import { useAuthStore } from '../../store/authStore';

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const getMembers = vi.fn();
vi.mock('../../services/teamService', () => ({
  teamService: {
    getMembers: () => getMembers(),
    getInvitations: vi.fn().mockResolvedValue([]),
  },
}));

/* *** SCOPED TO THE RAIL, BECAUSE "USD" IS ALSO AN `<option>`. ***
   The first version of this file asserted `getByText('USD')` against the whole
   page and matched the Preferences currency `<select>`'s own option — so it
   would have passed whether or not the tag rendered at all. The claim being
   made is "the tag is in the RAIL", and that is what this queries. */
const rail = () => within(screen.getByRole('navigation'));

function signIn(extra: Record<string, unknown>) {
  act(() => {
    useAuthStore.getState().login(
      {
        id: 't@t.com', email: 't@t.com', name: 'T',
        default_currency_code: 'USD', hasCompletedOnboarding: true,
        ...extra,
      } as never,
      'token', 'refresh',
    );
  });
  return render(<MemoryRouter><Settings /></MemoryRouter>);
}

afterEach(() => {
  localStorage.clear();
  getMembers.mockReset();
  act(() => { useAuthStore.getState().logout(); });
});

describe('the Settings rail shows each section’s state', () => {
  it('renders the module count, the channel and the currency', () => {
    signIn({ modules: ['pointspal', 'learnpal'] });
    expect(rail().getByText('2 on')).toBeInTheDocument();
    expect(rail().getByText('email only')).toBeInTheDocument();
    expect(rail().getByText('USD')).toBeInTheDocument();
  });

  it('counts only the modules that are actually showing', () => {
    // Entitled to two, one hidden — so the tag says one, while the Modules tab
    // still lists both because it is the only place to un-hide.
    signIn({ modules: ['pointspal', 'learnpal'], hidden_modules: ['learnpal'] });
    expect(rail().getByText('1 on')).toBeInTheDocument();
    expect(rail().queryByText('2 on')).not.toBeInTheDocument();
  });

  it('shows the household count for an admin, once it has loaded', async () => {
    getMembers.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    signIn({ is_admin: true, modules: ['pointspal'] });
    await waitFor(() => expect(rail().getByText('2 people')).toBeInTheDocument());
  });

  it('renders NO household tag when the member list fails, not “0 people”', async () => {
    // The load-bearing negative. A zero here is a false statement about an
    // instance whose members did not arrive, and it looks exactly like a true
    // one on screen.
    getMembers.mockRejectedValue(new Error('offline'));
    signIn({ is_admin: true, modules: ['pointspal'] });
    // The section itself is present for an admin...
    expect(rail().getByText('Household')).toBeInTheDocument();
    // ...but never with a fabricated count. Waited on so the rejected promise
    // has settled before asserting the absence — otherwise this passes simply
    // by running before the fetch resolved, which would assert nothing.
    await waitFor(() => expect(getMembers).toHaveBeenCalled());
    expect(rail().queryByText('0 people')).not.toBeInTheDocument();
    expect(rail().queryByText(/people$/)).not.toBeInTheDocument();
    expect(rail().queryByText(/person$/)).not.toBeInTheDocument();
  });

  it('does not request the member list for a non-admin', () => {
    // There is no Household section for them, so the tag cannot render and the
    // round trip would buy nothing.
    signIn({ modules: ['pointspal'] });
    expect(rail().queryByText('Household')).not.toBeInTheDocument();
    expect(getMembers).not.toHaveBeenCalled();
  });

  it('shows no module tag at all for a user entitled to none', () => {
    signIn({ modules: [] });
    // No Modules section, so nothing to tag — and crucially not "0 on", which
    // would describe a section that is not there.
    expect(rail().queryByText('Modules')).not.toBeInTheDocument();
    expect(rail().queryByText('0 on')).not.toBeInTheDocument();
  });

  it('omits the currency tag rather than guessing one', () => {
    signIn({ modules: ['pointspal'], default_currency_code: undefined });
    expect(rail().queryByText('USD')).not.toBeInTheDocument();
    // The section is still there; only its tag is absent.
    expect(rail().getByText('Preferences')).toBeInTheDocument();
  });
});
