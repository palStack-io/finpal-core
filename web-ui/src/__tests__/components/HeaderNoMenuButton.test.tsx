/**
 * The header has no menu button, and must not grow one back — AUDIT D-46.
 *
 * **Owner decision, 2026-08-06: web-ui is DESKTOP-ONLY.** The native app covers
 * phones, so the sidebar is always visible and there is nothing to toggle.
 *
 * The button that used to live here was dead for three sessions: `Sidebar` is
 * `React.FC` with no props and reads its own state, so #74's `isOpen`/`onClose`
 * were passed to a component that ignored them, and removing those left a control
 * that swapped its own icon and moved nothing. Measured before deleting it:
 * `.sidebar` is `position: fixed` at 240px with the content at `margin-left: 240px`
 * and **no media query anywhere** — so the button was the control for a drawer that
 * never existed.
 *
 * This asserts on RENDERED OUTPUT rather than on the props interface, because that
 * is the thing a user can actually click. A future refactor that reintroduces a
 * hamburger — with any wiring, or none — fails here. If the owner ever reverses the
 * decision and builds the drawer, this test is what should be rewritten to describe
 * it, deliberately, rather than deleted in passing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Header } from '../../components/layout/Header';

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'u@test.com', name: 'Test', default_currency_code: 'USD' } as any,
    token: 'tok',
    refreshToken: 'r',
    isAuthenticated: true,
  });
});

const renderHeader = () =>
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>
  );

describe('Header — D-46', () => {
  it('renders no menu toggle', () => {
    renderHeader();

    expect(screen.queryByLabelText('Open menu')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Close menu')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/menu/i)).not.toBeInTheDocument();
  });

  it('still renders the things it is actually for', () => {
    // Guards against "fixing" D-46 by breaking the header. Addressed by role: the
    // name also appears in the user menu, so a bare getByText('Test') is ambiguous
    // and fails for a reason that has nothing to do with what this asserts.
    renderHeader();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test');
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });
});
