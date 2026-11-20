import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { ThisWeekCard, useThisWeek, weekRange } from './ThisWeekCard';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => navigate,
}));

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  navigate.mockClear();
  useAuthStore.setState({
    user: { id: 'a@test.com', name: 'A' } as never, token: 't', refreshToken: 'r', isAuthenticated: true,
  });
});

const lesson = { id: 'interest', skill: 'interest', card: 'Interest is the biggest part of your debt cost.',
  action: { label: 'Add an extra payment', href: '/accounts' } };
const serve = (body: unknown, status = 200) =>
  server.use(http.get('*/api/v1/learnpal/this-week', () => HttpResponse.json(body as never, { status })));

const Host: React.FC = () => {
  const week = useThisWeek();
  return <div data-state={week.state}><ThisWeekCard week={week} /></div>;
};
const mount = () => render(<MemoryRouter><Host /></MemoryRouter>);

describe('ThisWeekCard', () => {
  it('shows the sentence, the two headings and the action', async () => {
    serve({ enabled: true, lesson });
    server.use(http.post('*/api/v1/learnpal/short/interest/finish', () => HttpResponse.json({})));
    mount();
    expect(await screen.findByText(lesson.card)).toBeInTheDocument();
    expect(screen.getByText('This week: understand this')).toBeInTheDocument();
    expect(screen.getByText('Do this')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Why it matters (1 min)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add an extra payment' }));
    expect(navigate).toHaveBeenCalledWith('/accounts');
  });

  it('names the held week in the first heading', async () => {
    serve({ enabled: true, lesson, week: { start: '2026-11-16', end: '2026-11-22' } });
    mount();
    expect(await screen.findByTestId('this-week-heading')).toHaveTextContent(/^This week, Nov 16\s*–\s*22: understand this$/);
  });

  it('Not now posts not_now and hides the card', async () => {
    serve({ enabled: true, lesson });
    let body: unknown = null;
    server.use(http.post('*/api/v1/learnpal/short/interest/finish', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 'interest', title: 'Interest', marks: { understood: false, used: false, remembered: false } });
    }));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByText(lesson.card)).toBeNull());
    await waitFor(() => expect(body).toEqual({ outcome: 'not_now' }));
  });

  it('Do this posts action, then navigates', async () => {
    serve({ enabled: true, lesson });
    let body: unknown = null;
    server.use(http.post('*/api/v1/learnpal/short/interest/finish', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: 'interest', title: 'Interest', marks: { understood: true, used: true, remembered: false } });
    }));
    mount();
    await userEvent.click(await screen.findByTestId('this-week-action'));
    expect(navigate).toHaveBeenCalledWith('/accounts');
    await waitFor(() => expect(body).toEqual({ outcome: 'action' }));
  });

  it('Do this on the page it points at opens the lesson instead of doing nothing', async () => {
    const here = { ...lesson, id: 'month', skill: 'read-your-month',
      action: { label: 'Open your dashboard', href: '/dashboard' } };
    serve({ enabled: true, lesson: here });
    let posted = false;
    server.use(http.get('*/api/v1/learnpal/short/month', () => HttpResponse.json({}, { status: 404 })));
    server.use(http.post('*/api/v1/learnpal/short/month/finish', () => {
      posted = true;
      return HttpResponse.json({});
    }));
    render(<MemoryRouter initialEntries={['/dashboard']}><Host /></MemoryRouter>);
    await userEvent.click(await screen.findByTestId('this-week-action'));
    expect(navigate).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // Opening the lesson is not taking the action: the panel's own step 4 records that.
    expect(posted).toBe(false);
  });

  it('renders nothing when learning is off', async () => {
    serve({ enabled: false, lesson: null });
    const { container } = mount();
    await waitFor(() => expect(container.firstElementChild).toHaveAttribute('data-state', 'hide'));
    expect(screen.queryByTestId('this-week-card')).toBeNull();
  });

  it('renders nothing when the fetch fails', async () => {
    serve({}, 500);
    const { container } = mount();
    await waitFor(() => expect(container.firstElementChild).toHaveAttribute('data-state', 'hide'));
    expect(screen.queryByTestId('this-week-card')).toBeNull();
  });
});

describe('weekRange', () => {
  it('collapses a week inside one month and spans two months', () => {
    expect(weekRange('2026-11-16', '2026-11-22', 'en')).toBe('Nov 16 – 22');
    expect(weekRange('2026-11-30', '2026-12-06', 'en')).toBe('Nov 30 – Dec 6');
  });

  it('gives nothing for a bad date', () => {
    expect(weekRange('nope', '2026-11-22', 'en')).toBe('');
  });
});
