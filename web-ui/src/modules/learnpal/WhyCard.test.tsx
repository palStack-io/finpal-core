import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { WhyCard } from './WhyCard';

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

const card = (id: string, text: string) => ({
  id, skill: id, card: text, action: { label: `Go ${id}`, href: `/${id}` },
});
const serve = (body: unknown, status = 200) =>
  server.use(http.get('*/api/v1/learnpal/why', () => HttpResponse.json(body as never, { status })));
const draw = () => render(<MemoryRouter><WhyCard screen="budgets" /></MemoryRouter>);

describe('WhyCard', () => {
  it('renders nothing when learning is off', async () => {
    serve({ enabled: false, cards: [card('a', 'Sentence A')] });
    draw();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('why-card')).toBeNull();
  });

  it('renders nothing when there are no cards', async () => {
    serve({ enabled: true, cards: [] });
    draw();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('why-card')).toBeNull();
  });

  it('renders nothing when the fetch fails', async () => {
    serve({ detail: 'boom' }, 500);
    draw();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('why-card')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows one card when the server returns two, and the action navigates', async () => {
    serve({ enabled: true, cards: [card('a', 'Sentence A'), card('b', 'Sentence B')] });
    draw();
    expect(await screen.findByText('Sentence A')).toBeTruthy();
    expect(screen.queryByText('Sentence B')).toBeNull();
    expect(screen.getAllByTestId('why-card')).toHaveLength(1);
    await userEvent.click(screen.getByTestId('why-action'));
    expect(navigate).toHaveBeenCalledWith('/a');
  });

  it('opens the lesson panel from the Why link, and refetches on close', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/v1/learnpal/why', () => {
        calls += 1;
        return HttpResponse.json({ enabled: true, cards: calls === 1 ? [card('a', 'Sentence A')] : [] });
      }),
      http.get('*/api/v1/learnpal/short/:id', () => new HttpResponse(null, { status: 500 })),
    );
    draw();
    await userEvent.click(await screen.findByTestId('why-open'));
    await userEvent.click(await screen.findByLabelText('Close panel'));
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(screen.queryByTestId('why-card')).toBeNull());
  });
});
