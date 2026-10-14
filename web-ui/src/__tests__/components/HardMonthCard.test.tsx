/**
 * Phase 1e: the hard-month opening. One calm line, one action, a close that the
 * server remembers; nothing at all when there is no opening or the lookup fails.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { HardMonthCard } from '../../components/onboarding/HardMonthCard';

const OFF_PLAN = {
  state: 'off_plan', key: 'hm-month:2026-09',
  text: "Last month didn't go to plan. You can start by looking at one category.",
  action: 'Review a category', href: '/budgets', dismiss: 'Close',
};

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}><HardMonthCard /></MemoryRouter>);

describe('HardMonthCard', () => {
  it('shows the server line and its one action', async () => {
    server.use(http.get('*/api/v1/modules/hard-month', () => HttpResponse.json({ opening: OFF_PLAN })));
    at('/dashboard');
    expect(await screen.findByText(OFF_PLAN.text)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review a category' })).toHaveAttribute('href', '/budgets');
  });

  it('does not offer a link to the page you are already on', async () => {
    server.use(http.get('*/api/v1/modules/hard-month', () => HttpResponse.json({ opening: OFF_PLAN })));
    at('/budgets');
    expect(await screen.findByText(OFF_PLAN.text)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review a category' })).toBeNull();
  });

  it('closing tells the server which episode, then disappears', async () => {
    let posted: unknown = null;
    server.use(
      http.get('*/api/v1/modules/hard-month', () => HttpResponse.json({ opening: OFF_PLAN })),
      http.post('*/api/v1/modules/hard-month/dismiss', async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json({ dismissed: OFF_PLAN.key });
      }),
    );
    at('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText(OFF_PLAN.text)).toBeNull());
    expect(posted).toEqual({ key: 'hm-month:2026-09' });
  });

  it('renders nothing when there is no opening', async () => {
    const { container } = at('/dashboard');
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the lookup fails', async () => {
    server.use(http.get('*/api/v1/modules/hard-month', () => new HttpResponse(null, { status: 500 })));
    const { container } = at('/dashboard');
    await new Promise((r) => setTimeout(r, 50));
    expect(container.innerHTML).toBe('');
  });

  it('is not styled as a warning', async () => {
    server.use(http.get('*/api/v1/modules/hard-month', () => HttpResponse.json({ opening: OFF_PLAN })));
    at('/dashboard');
    const card = (await screen.findByText(OFF_PLAN.text)).closest('section')!;
    expect(card.getAttribute('role')).not.toBe('alert');
    expect(card.outerHTML).not.toMatch(/danger|error|#ef4444|#dc2626|red/i);
  });
});
