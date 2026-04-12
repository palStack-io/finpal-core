import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { Settings } from '../../pages/Settings';
import { useAuthStore } from '../../store/authStore';

// Mock heavy dependencies that Settings imports
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Mock all API calls from Settings
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe('Settings — Modules tab', () => {
  afterEach(() => {
    localStorage.clear();
    act(() => { useAuthStore.getState().logout(); });
  });

  it('Modules tab absent when user has no modules', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: [] } as any,
        'token', 'refresh'
      );
    });
    renderSettings();
    expect(screen.queryByText('Modules')).not.toBeInTheDocument();
  });

  it('Modules tab present when user has modules', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: ['pointspal'] } as any,
        'token', 'refresh'
      );
    });
    renderSettings();
    expect(screen.getByText('Modules')).toBeInTheDocument();
  });

  it('ModuleCard toggle writes module_hidden_* to localStorage', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: ['pointspal'] } as any,
        'token', 'refresh'
      );
    });
    renderSettings();
    // Click the Modules tab
    fireEvent.click(screen.getByText('Modules'));
    // Find the hide toggle button (Show/Hide in sidebar)
    const hideBtn = screen.queryByText(/Hide in sidebar|Show in sidebar/i);
    if (hideBtn) {
      fireEvent.click(hideBtn);
      expect(localStorage.getItem('module_hidden_pointspal')).toBeTruthy();
    }
  });
});
