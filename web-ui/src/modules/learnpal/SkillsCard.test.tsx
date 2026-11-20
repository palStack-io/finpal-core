import React from 'react';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { SkillsCard, useSkillsProgress } from './SkillsCard';
import type { SkillProgress } from '../../types/learnpal';

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'a@test.com', name: 'A' } as never, token: 't', refreshToken: 'r', isAuthenticated: true,
  });
});

const SKILLS: SkillProgress[] = [
  { id: 'read-your-month', title: 'Read your month', short: null,
    marks: { understood: false, used: false, remembered: false } },
  { id: 'fixed-costs', title: 'Know your fixed costs', short: 'fixed-share',
    marks: { understood: true, used: false, remembered: false } },
  { id: 'non-monthly', title: 'Plan for non-monthly costs', short: 'non-monthly',
    marks: { understood: false, used: false, remembered: false } },
  // Marks are independent: used without understood, remembered without used.
  { id: 'buffer', title: 'Build a buffer', short: null, marks: { understood: false, used: true, remembered: false } },
  { id: 'interest', title: 'Understand interest', short: 'interest',
    marks: { understood: false, used: false, remembered: true } },
  { id: 'pay-down', title: 'Pay down debt', short: 'debt-order',
    marks: { understood: true, used: true, remembered: true } },
];

const Host: React.FC = () => {
  const { skills: s, loading } = useSkillsProgress();
  return (
    <MemoryRouter>
      <div data-testid="host" data-loading={String(loading)}>{s && <SkillsCard skills={s} />}</div>
    </MemoryRouter>
  );
};
const serve = (body: unknown, status = 200, week: unknown = { enabled: true, lesson: null }) =>
  server.use(
    http.get('*/api/v1/learnpal/skills-progress', () => HttpResponse.json(body as never, { status })),
    http.get('*/api/v1/learnpal/this-week', () => HttpResponse.json(week as never)),
  );
const card = (title: string) =>
  within(screen.getByRole('list', { name: 'Six skills' })).getByText(title).closest('li') as HTMLElement;

describe('SkillsCard: the skills trail', () => {
  it('shows six waypoints and one card per skill, each naming all three marks in words', async () => {
    serve({ enabled: true, skills: SKILLS });
    render(<Host />);
    expect(await screen.findByText('Your skills')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Six skills' });
    const cards = within(list).getAllByTestId('skill-card');
    expect(cards).toHaveLength(6);
    expect(screen.getAllByTestId('skill-waypoint')).toHaveLength(6);
    for (const c of cards) {
      const words = within(c).getAllByTestId('skill-mark').map((m) => m.getAttribute('data-mark'));
      expect(words).toEqual(['Understood', 'Used on your money', 'Still remembered']);
    }
  });

  it('fills each mark on its own, and says so in words, not by fill alone', async () => {
    serve({ enabled: true, skills: SKILLS });
    render(<Host />);
    await screen.findByText('Your skills');
    const state = (title: string) => within(card(title)).getAllByTestId('skill-mark')
      .map((m) => m.getAttribute('data-on'));
    expect(state('Build a buffer')).toEqual(['false', 'true', 'false']);
    expect(state('Understand interest')).toEqual(['false', 'false', 'true']);
    expect(state('Pay down debt')).toEqual(['true', 'true', 'true']);
    const used = within(card('Build a buffer')).getAllByTestId('skill-mark')[1];
    expect(used).toHaveTextContent('Used on your money, yes');
    expect(within(card('Build a buffer')).getAllByTestId('skill-mark')[0]).toHaveTextContent('Understood, not yet');
  });

  it('links each skill to its short lesson only when one applies: Start before understood, Read why after', async () => {
    serve({ enabled: true, skills: SKILLS });
    render(<Host />);
    await screen.findByText('Your skills');
    expect(within(card('Read your month')).queryByRole('button')).toBeNull();
    expect(within(card('Build a buffer')).queryByRole('button')).toBeNull();
    expect(within(card('Plan for non-monthly costs')).getByRole('button', { name: 'Start, 1 min: Plan for non-monthly costs' }))
      .toBeInTheDocument();
    expect(within(card('Know your fixed costs')).getByRole('button', { name: 'Read why, 1 min: Know your fixed costs' }))
      .toBeInTheDocument();
    // Remembered but not understood is still "Start": the link follows the understood mark only.
    expect(within(card('Understand interest')).getByRole('button', { name: /^Start, 1 min/ })).toBeInTheDocument();
  });

  it('highlights the skill held in This week', async () => {
    serve({ enabled: true, skills: SKILLS }, 200, {
      enabled: true, week: { start: '2026-11-16', end: '2026-11-22' },
      lesson: { id: 'non-monthly', skill: 'non-monthly', card: 'x', action: { label: 'Plan it', href: '/budgets' } },
    });
    render(<Host />);
    await screen.findByText('Your skills');
    await waitFor(() => expect(card('Plan for non-monthly costs')).toHaveAttribute('data-this-week', 'true'));
    expect(within(card('Plan for non-monthly costs')).getByText('This week')).toBeInTheDocument();
    expect(screen.getAllByText('This week')).toHaveLength(1);
    expect(card('Read your month')).toHaveAttribute('data-this-week', 'false');
  });

  it('opens the short lesson in place and fills the mark it earns', async () => {
    serve({ enabled: true, skills: SKILLS });
    server.use(
      http.get('*/api/v1/learnpal/short/:id', ({ params }) => HttpResponse.json({
        id: params.id, skill: 'non-monthly', skill_title: 'Plan for non-monthly costs', long_lesson: null,
        number: '$132.00 a year for Car tax is $11.00 a month.', explain: ['a', 'b'],
        try: { kind: 'sinking', item: 'Car tax', yearly: '132.00', monthly: '11.00' },
        action: { label: 'Plan it in budgets', href: '/budgets' }, when: false,
        lines: { not_now: 'Fine.', understood: 'You have the idea.', when_prompt: 'When?' },
      })),
      http.post('*/api/v1/learnpal/short/:id/finish', () => HttpResponse.json({
        id: 'non-monthly', title: 'Plan for non-monthly costs', marks: { understood: true, used: false, remembered: false },
      })),
    );
    render(<Host />);
    await screen.findByText('Your skills');
    await userEvent.click(within(card('Plan for non-monthly costs')).getByRole('button'));
    expect(await screen.findByText('$132.00 a year for Car tax is $11.00 a month.')).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByTestId('short-next'));
    await waitFor(() => expect(within(card('Plan for non-monthly costs')).getAllByTestId('skill-mark')[0])
      .toHaveAttribute('data-on', 'true'));
    expect(within(card('Plan for non-monthly costs')).getByRole('button', { name: /^Read why, 1 min/ })).toBeInTheDocument();
  });

  it('is hidden when learning is off or the fetch fails', async () => {
    for (const [body, status] of [[{ enabled: false, skills: [] }, 200], [{}, 500]] as const) {
      serve(body, status);
      const { unmount } = render(<Host />);
      await new Promise((r) => setTimeout(r, 50));
      await waitFor(() => expect(screen.queryByTestId('skills-card')).toBeNull());
      unmount();
    }
  });

  it('reports loading until the fetch settles, then not loading with or without skills', async () => {
    serve({ enabled: true, skills: SKILLS });
    const { unmount } = render(<Host />);
    expect(screen.getByTestId('host')).toHaveAttribute('data-loading', 'true');
    await waitFor(() => expect(screen.getByTestId('host')).toHaveAttribute('data-loading', 'false'));
    unmount();
    serve({ enabled: false, skills: [] });
    render(<Host />);
    await waitFor(() => expect(screen.getByTestId('host')).toHaveAttribute('data-loading', 'false'));
    expect(screen.queryByTestId('skills-card')).toBeNull();
  });
});
