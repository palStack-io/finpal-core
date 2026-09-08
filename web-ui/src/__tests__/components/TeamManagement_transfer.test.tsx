import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TeamManagement } from '../../components/settings/TeamManagement';
import { teamService } from '../../services/teamService';

/**
 * palStack-io/finpal-core#142 — "Can't transfer household".
 *
 * *** THE CARD WAS A PLACEHOLDER AND SAID SO IN ITS OWN COMMENT: "Transfer
 * Ownership (Future)". *** It rendered a heading, the sentence "Only the account
 * owner can transfer ownership to another admin" and an "Admin Only" badge, and
 * contained no control of any kind — no picker, no button. Meanwhile
 * `POST /api/v1/team/transfer-ownership` exists and works, and
 * `teamService.transferOwnership` was written and called from **nowhere** in the app.
 *
 * So the reporter had not missed a permission or a prerequisite. The feature was
 * described on screen with nothing behind it, which is why adding a second admin
 * (their first theory) changed nothing.
 *
 * The service signature was wrong too, and being uncalled is exactly why nothing
 * caught it: `transferOwnership(memberId: number)` against a handler that does
 * `User.query.filter_by(id=member_id)` where the id IS an email string. D-52's shape.
 */

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../services/teamService', () => ({
  teamService: {
    getMembers: vi.fn(),
    getInvitations: vi.fn(),
    transferOwnership: vi.fn(),
    inviteUser: vi.fn(),
    cancelInvitation: vi.fn(),
    resendInvitation: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
  },
}));

const OWNER = {
  id: 'owner@test.com', name: 'Owner', email: 'owner@test.com',
  role: 'owner', joinedAt: '2026-01-01T00:00:00', lastActive: null, avatar: null,
};
const MEMBER = {
  id: 'member@test.com', name: 'Rachel', email: 'member@test.com',
  role: 'member', joinedAt: '2026-02-01T00:00:00', lastActive: null, avatar: null,
};

beforeEach(() => {
  vi.mocked(teamService.getMembers).mockResolvedValue([OWNER, MEMBER] as any);
  vi.mocked(teamService.getInvitations).mockResolvedValue([] as any);
  vi.mocked(teamService.transferOwnership).mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function renderTeam() {
  const view = render(<TeamManagement />);
  await waitFor(() => expect(teamService.getMembers).toHaveBeenCalled());
  return view;
}

describe('TeamManagement — Transfer Ownership is wired (#142)', () => {
  it('offers a control at all, which the placeholder never did', async () => {
    await renderTeam();

    const button = await screen.findByRole('button', { name: /transfer ownership/i });
    expect(button,
      'the Transfer Ownership card still has no button — it is the "(Future)" ' +
      'placeholder (#142)'
    ).toBeTruthy();
  });

  it('lists every non-owner member as a candidate, and no owner', async () => {
    await renderTeam();

    const select = await screen.findByLabelText(/new owner/i);
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);

    expect(options.some((t) => t?.includes('member@test.com'))).toBe(true);
    expect(options.some((t) => t?.includes('owner@test.com'))).toBe(false);
  });

  it('sends the member EMAIL, not a numeric id', async () => {
    await renderTeam();

    fireEvent.change(await screen.findByLabelText(/new owner/i),
      { target: { value: 'member@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /transfer ownership/i }));

    await waitFor(() =>
      expect(teamService.transferOwnership).toHaveBeenCalledWith('member@test.com')
    );
  });

  it('asks for confirmation and does nothing if declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderTeam();

    fireEvent.change(await screen.findByLabelText(/new owner/i),
      { target: { value: 'member@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /transfer ownership/i }));

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(teamService.transferOwnership).not.toHaveBeenCalled();
  });

  it('reloads the members list afterwards, because two roles changed', async () => {
    await renderTeam();
    vi.mocked(teamService.getMembers).mockClear();

    fireEvent.change(await screen.findByLabelText(/new owner/i),
      { target: { value: 'member@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /transfer ownership/i }));

    // Not cosmetic: the caller has just demoted THEMSELVES, so a stale list leaves
    // them looking like the owner and the new owner looking like a member.
    await waitFor(() => expect(teamService.getMembers).toHaveBeenCalled());
  });

  it('says so plainly when there is nobody to transfer to', async () => {
    vi.mocked(teamService.getMembers).mockResolvedValue([OWNER] as any);
    await renderTeam();

    expect(await screen.findByText(/nobody to transfer ownership to/i)).toBeTruthy();
    expect(screen.queryByLabelText(/new owner/i)).toBeNull();
  });
});

describe('TeamManagement — an invitation with no expiry (#143)', () => {
  it('does not render "Invalid Date" for a legacy invitation', async () => {
    vi.mocked(teamService.getInvitations).mockResolvedValue([{
      id: 1, email: 'legacy@test.com', role: 'member', status: 'pending',
      sentAt: '2026-09-01T00:00:00', expiresAt: '', invitedBy: 'Owner',
    }] as any);

    await renderTeam();

    // `new Date('')` is `Invalid Date`, and the old code formatted it unguarded.
    // An invitation predating the `expires_at` column really has no expiry, so the
    // honest render is to say nothing rather than to invent one.
    await waitFor(() => expect(screen.getByText(/legacy@test.com/)).toBeTruthy());
    expect(screen.queryByText(/invalid date/i)).toBeNull();
    expect(screen.queryByText(/^Expires:/)).toBeNull();
  });

  it('renders a real expiry when the API sends one', async () => {
    vi.mocked(teamService.getInvitations).mockResolvedValue([{
      id: 2, email: 'timed@test.com', role: 'member', status: 'pending',
      sentAt: '2026-09-01T00:00:00', expiresAt: '2026-09-15T00:00:00',
      invitedBy: 'Owner',
    }] as any);

    await renderTeam();

    await waitFor(() => expect(screen.getByText(/Expires:/)).toBeTruthy());
    expect(screen.queryByText(/invalid date/i)).toBeNull();
  });
});
