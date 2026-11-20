import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';
import { LearningSwitch } from '../settings/LearningSwitch';

vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

describe('Switch', () => {
  it('is a named switch with a 44px target that reports its state', async () => {
    const onChange = vi.fn();
    render(<Switch checked label="Learn as you go" onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Learn as you go' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw.style.minWidth).toBe('44px');
    expect(sw.style.minHeight).toBe('44px');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does nothing while saving', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="x" busy onChange={onChange} />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('is the control the Learn as you go row uses (UX audit 2026-11-20 P1-8)', () => {
    render(<LearningSwitch />);
    expect(screen.getByRole('switch').getAttribute('data-switch')).toBe('fp');
  });
});
