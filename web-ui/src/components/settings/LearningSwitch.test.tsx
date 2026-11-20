import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LearningSwitch } from './LearningSwitch';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';

vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../services/userService', () => ({ userService: { updateProfile: vi.fn() } }));

const setUser = (extra: object) => useAuthStore.setState({
  user: { id: 'a@test.com', name: 'A', ...extra } as never, token: 't', refreshToken: 'r', isAuthenticated: true,
});

beforeEach(() => { vi.mocked(userService.updateProfile).mockReset(); });

describe('LearningSwitch', () => {
  it('shows the title and sub-line, and reads NULL/absent as on', () => {
    setUser({});
    render(<LearningSwitch />);
    expect(screen.getByText('Learn as you go')).toBeInTheDocument();
    expect(screen.getByText(/Turn it off any time; what you already learned is kept\./)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Learn as you go' })).toHaveAttribute('aria-checked', 'true');
  });

  it('turning it off saves false and refreshes the cached user', async () => {
    setUser({ learn_as_you_go: true });
    vi.mocked(userService.updateProfile).mockResolvedValue({ learn_as_you_go: false } as never);
    render(<LearningSwitch />);
    await userEvent.click(screen.getByRole('switch'));
    expect(userService.updateProfile).toHaveBeenCalledWith({ learn_as_you_go: false });
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
    expect(useAuthStore.getState().user?.learn_as_you_go).toBe(false);
  });

  it('turning it back on saves true', async () => {
    setUser({ learn_as_you_go: false });
    vi.mocked(userService.updateProfile).mockResolvedValue({ learn_as_you_go: true } as never);
    render(<LearningSwitch />);
    await userEvent.click(screen.getByRole('switch'));
    expect(userService.updateProfile).toHaveBeenCalledWith({ learn_as_you_go: true });
    await waitFor(() => expect(useAuthStore.getState().user?.learn_as_you_go).toBe(true));
  });

  it('keeps the old value when the save fails', async () => {
    setUser({ learn_as_you_go: true });
    vi.mocked(userService.updateProfile).mockRejectedValue(new Error('nope'));
    render(<LearningSwitch />);
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('switch')).not.toBeDisabled());
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});
