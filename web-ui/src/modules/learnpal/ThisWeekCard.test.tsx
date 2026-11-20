import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { ThisWeekCard, useThisWeek } from './ThisWeekCard';

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
    mount();
    expect(await screen.findByText(lesson.card)).toBeInTheDocument();
    expect(screen.getByText('This week: understand this')).toBeInTheDocument();
    expect(screen.getByText('Do this')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Why it matters (1 min)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add an extra payment' }));
    expect(navigate).toHaveBeenCalledWith('/accounts');
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
