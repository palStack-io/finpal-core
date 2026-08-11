/**
 * The drawer AUDIT D-46 deleted, and the assertions that would have caught why it
 * was deleted.
 *
 * D-46 closed by removing a hamburger that swapped its own icon and moved nothing:
 * #74 passed `isOpen`/`onClose` to a `Sidebar` that was `React.FC` with no props
 * and read its own state, so the props went nowhere. The button existed, looked
 * live, and controlled a drawer that had never been built.
 *
 * *** SO THE CENTRAL TEST HERE IS NOT "THE BUTTON RENDERS". *** It is that
 * activating the trigger changes the RAIL, that dismissing it changes the rail
 * back, and that focus ends up somewhere a person can use. Every one of those
 * would have failed against the code D-46 deleted, while "a hamburger is present"
 * passed against it.
 *
 * Geometry is deliberately not asserted here: jsdom has no layout engine and no
 * media queries, so `translateX(-100%)` and `display: none` are not observable.
 * The width behaviour is measured for real, in a real browser at 390px, by
 * `scripts/responsive-walk/run.mjs`. This file asserts the wiring; that one
 * asserts the layout. Neither can do the other's job.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import { Sidebar } from '../../components/layout/Sidebar';
import { useAuthStore } from '../../store/authStore';
import { ThemeProvider } from '../../contexts/ThemeContext';

/**
 * A local stand-in for `App.tsx`'s `AppLayout`, mirroring its wiring. App.tsx
 * cannot be imported here — it mounts a `BrowserRouter` and the entire route
 * table — and the alternative, asserting on the file's text, is what let D-46's
 * props look connected while going nowhere.
 */
const Shell: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.getElementById('app-sidebar')?.querySelector<HTMLElement>('a[href], button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => { setOpen(false); triggerRef.current?.focus(); };

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        className="sidebar-trigger"
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="app-sidebar"
        onClick={() => setOpen((v) => !v)}
      >
        menu
      </button>
      {open && (
        <button type="button" className="sidebar-scrim" aria-label="Close navigation" onClick={close} />
      )}
      <Sidebar isOpen={open} onClose={close} />
      <main className="main-content" aria-hidden={open || undefined}>
        <Routes>
          <Route path="/dashboard" element={<p>dashboard page</p>} />
          <Route path="/transactions" element={<p>transactions page</p>} />
        </Routes>
      </main>
    </div>
  );
};

const renderShell = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <ThemeProvider><Shell /></ThemeProvider>
  </MemoryRouter>
);

const rail = () => document.getElementById('app-sidebar')!;

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'u@test.com', name: 'Test', default_currency_code: 'GBP' } as never,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

describe('the phone drawer', () => {
  it('the trigger declares what it controls, and that element exists', async () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    // aria-controls pointing at nothing is the accessible version of a button that
    // moves nothing, and it is not observable by looking at the screen.
    expect(trigger).toHaveAttribute('aria-controls', 'app-sidebar');
    expect(document.getElementById('app-sidebar')).not.toBeNull();
  });

  it('*** opening changes the RAIL, not just the button ***', async () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });

    expect(rail().className).toBe('sidebar');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);

    // This is the assertion D-46's deleted code would have failed: the class the
    // phone-width transform reads has to actually arrive on the rail.
    expect(rail().className).toContain('is-open');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on the scrim, and gives focus back to the trigger', async () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await userEvent.click(trigger);

    await userEvent.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect(rail().className).toBe('sidebar');
    // Restored, not dropped on a node that just left the tree — otherwise the next
    // Tab starts from the top of the document.
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(rail().className).toContain('is-open');

    await userEvent.keyboard('{Escape}');

    expect(rail().className).toBe('sidebar');
  });

  it('closes when a nav link navigates, rather than covering the page you asked for', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(rail().className).toContain('is-open');

    await userEvent.click(within(rail()).getByRole('link', { name: /transactions/i }));

    await waitFor(() => expect(rail().className).toBe('sidebar'));
    expect(await screen.findByText('transactions page')).toBeInTheDocument();
  });

  it('hides the page behind it from assistive tech while open', async () => {
    renderShell();
    const main = document.querySelector('main.main-content')!;
    expect(main.hasAttribute('aria-hidden')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    // A screen reader reading the page underneath an open drawer is the same defect
    // as a sighted user seeing it — it is just invisible to a screenshot.
    expect(main).toHaveAttribute('aria-hidden', 'true');
  });

  it('moves focus into the rail on open, so the keyboard follows the drawer', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(rail().contains(document.activeElement)).toBe(true);
  });
});
