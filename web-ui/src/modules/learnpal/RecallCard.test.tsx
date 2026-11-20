import React from 'react';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { RecallCard, useRecall } from './RecallCard';
import { DashboardSlot } from '../../components/home/DashboardSlot';

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'a@test.com', name: 'A' } as never, token: 't', refreshToken: 'r', isAuthenticated: true,
  });
});

const recall = { id: 7, skill: 'interest', prompt: 'Which payment costs less in interest?',
  options: ['Pay the minimum', 'Pay a little extra', 'Skip a month'], not_sure_label: 'Not sure yet' };
const marks = { understood: true, used: false, remembered: false };
const serve = (body: unknown, status = 200) =>
  server.use(http.get('*/api/v1/learnpal/recall', () => HttpResponse.json(body as never, { status })));
const answerWith = (result: unknown) => {
  const posted: unknown[] = [];
  server.use(http.post('*/api/v1/learnpal/recall/7', async ({ request }) => {
    posted.push(await request.json());
    return HttpResponse.json(result as never);
  }));
  return posted;
};

const Host: React.FC = () => {
  const r = useRecall();
  return <div data-state={r.state}><RecallCard recall={r} /></div>;
};

describe('RecallCard', () => {
  it('offers three options, Not sure yet and Not now', async () => {
    serve({ enabled: true, recall });
    render(<Host />);
    expect(await screen.findByText(recall.prompt)).toBeInTheDocument();
    for (const o of recall.options) expect(screen.getByRole('button', { name: o })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not sure yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('a right answer shows the why and "You\'ve got this one", then Done removes the card', async () => {
    serve({ enabled: true, recall });
    const posted = answerWith({ right: true, why: 'Extra goes straight at the balance.', marks });
    render(<Host />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pay a little extra' }));
    expect(await screen.findByText('Extra goes straight at the balance.')).toBeInTheDocument();
    expect(screen.getByText("You've got this one")).toBeInTheDocument();
    expect(posted).toEqual([{ choice: '1' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('recall-card')).toBeNull();
  });

  it('a miss says "worth another look" and never the word wrong', async () => {
    serve({ enabled: true, recall });
    answerWith({ right: false, why: 'The minimum barely covers the interest.', marks });
    const { container } = render(<Host />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pay the minimum' }));
    expect(await screen.findByText('This is worth another look')).toBeInTheDocument();
    expect(screen.getByText('The minimum barely covers the interest.')).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain('wrong');
  });

  it('Not sure yet is an answer and is explained', async () => {
    serve({ enabled: true, recall });
    const posted = answerWith({ right: null, why: 'Extra payments cut the interest.', marks });
    render(<Host />);
    await userEvent.click(await screen.findByRole('button', { name: 'Not sure yet' }));
    expect(await screen.findByText('Extra payments cut the interest.')).toBeInTheDocument();
    expect(screen.getByText('This is worth another look')).toBeInTheDocument();
    expect(posted).toEqual([{ choice: 'not_sure' }]);
  });

  it('Not now posts not_now and removes the card', async () => {
    serve({ enabled: true, recall });
    const posted = answerWith({ right: null, why: '', marks });
    render(<Host />);
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByTestId('recall-card')).toBeNull());
    expect(posted).toEqual([{ choice: 'not_now' }]);
  });

  it('renders nothing when off, empty or failing', async () => {
    for (const [body, status] of [[{ enabled: false, recall: null }, 200], [{ enabled: true, recall: null }, 200], [{}, 500]] as const) {
      serve(body, status);
      const { container, unmount } = render(<Host />);
      await waitFor(() => expect(container.firstElementChild).toHaveAttribute('data-state', 'hide'));
      expect(screen.queryByTestId('recall-card')).toBeNull();
      unmount();
    }
  });

  it('holds the slot after Not now and after Done: the next card does not fill it this visit', async () => {
    const SlotHost: React.FC = () => {
      const r = useRecall();
      return (
        <DashboardSlot entries={[
          { key: 'recall', state: r.state, render: () => <RecallCard recall={r} /> },
          { key: 'this-week', state: 'show', render: () => <p>this week card</p> },
        ]} />
      );
    };
    serve({ enabled: true, recall });
    answerWith({ right: true, why: 'Because.', marks });
    const first = render(<SlotHost />);
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByTestId('recall-card')).toBeNull());
    expect(screen.queryByText('this week card')).toBeNull();
    first.unmount();

    render(<SlotHost />);
    await userEvent.click(await screen.findByRole('button', { name: recall.options[0] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByTestId('recall-card')).toBeNull());
    expect(screen.queryByText('this week card')).toBeNull();
  });
});
