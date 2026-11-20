import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LearnQuestion } from './LearnQuestion';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';

vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../services/userService', () => ({ userService: { updateProfile: vi.fn() } }));

beforeEach(() => {
  vi.mocked(userService.updateProfile).mockReset();
  useAuthStore.setState({ user: { id: 'a@test.com', name: 'A' } as never, token: 't', refreshToken: 'r', isAuthenticated: true });
});

describe('LearnQuestion (onboarding)', () => {
  it('asks the question with both answers', () => {
    render(<LearnQuestion chosen={null} onChosen={() => {}} />);
    expect(screen.getByText('Want finPal to explain your numbers as you go?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Yes, show me' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'No, just the numbers' })).toBeInTheDocument();
  });

  it.each([['Yes, show me', true], ['No, just the numbers', false]])('"%s" saves %s', async (label, value) => {
    vi.mocked(userService.updateProfile).mockResolvedValue({ learn_as_you_go: value } as never);
    const onChosen = vi.fn();
    render(<LearnQuestion chosen={null} onChosen={onChosen} />);
    await userEvent.click(screen.getByRole('radio', { name: label }));
    expect(userService.updateProfile).toHaveBeenCalledWith({ learn_as_you_go: value });
    await waitFor(() => expect(onChosen).toHaveBeenCalledWith(value));
    expect(useAuthStore.getState().user?.learn_as_you_go).toBe(value);
  });

  it('shows the saved choice when remounted with it (Back then Next)', () => {
    render(<LearnQuestion chosen={false} onChosen={() => {}} />);
    expect(screen.getByRole('radio', { name: 'No, just the numbers' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Yes, show me' })).toHaveAttribute('aria-checked', 'false');
  });
});
