/**
 * Phase 5d: the quick check at the end of a lesson, and Phase 5c: the emergency-fund lessons carry the
 * 3, 6 and 9 month calculator. Rules under test (spec: finPal/docs/phase5-learnpal-quiz-spec.md): it is an
 * offer, "Not sure" is never wrong, every answer is explained, there is no score, it ends with the lesson's
 * one action. Core edition: no motion kit, so no reduced-motion case.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';

import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useLessonReader } from '../../modules/learnpal/LessonReader';

const QUIZ = {
  action: { label: 'Start a starter buffer', href: '/goals' },
  questions: [
    { id: 'q1', prompt: 'What is a starter buffer for?', not_sure: 'It catches the next thing that breaks.',
      options: [
        { text: 'The next small emergency', right: true, why: 'It keeps a broken boiler off the card.' },
        { text: 'Retirement', right: false, why: 'That is a different pot, for a different decade.' },
        { text: 'Holidays', right: false, why: 'A sinking fund handles the planned spending.' },
      ] },
    { id: 'q2', prompt: 'How big does it start?', not_sure: 'Small: one bill, not six months.',
      options: [
        { text: 'Six months of costs', right: false, why: 'That is where it can grow to, not where it starts.' },
        { text: 'About one surprise bill', right: true, why: 'Small enough to reach soon.' },
        { text: 'Nothing until the debt is gone', right: false, why: 'Without it the next surprise lands on the card.' },
      ] },
  ],
};

let posted: unknown = null;

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  posted = null;
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'USD' } as never,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
  server.use(
    http.get('*/api/v1/learnpal/lessons/a-starter-buffer', () => HttpResponse.json({ success: true, lesson: {
      slug: 'a-starter-buffer', title: 'The rope you tie on first', body_md: 'A small pot for the next thing that breaks.',
      earned: true, locked: false, gear_slug: null, surface: 'mountain', quiz: QUIZ } })),
    http.get('*/api/v1/learnpal/lessons/where-your-money-goes', () => HttpResponse.json({ success: true, lesson: {
      slug: 'where-your-money-goes', title: 'Where your money goes', body_md: 'Look at the shape of it.',
      earned: true, locked: false, gear_slug: null, surface: 'mountain', quiz: null } })),
    http.get('*/api/v1/goals/buffer-picture', () => HttpResponse.json({ success: true, buffer: {
      essential_monthly: 1000, held: 2500, months_covered: 2.5,
      targets: [3, 6, 9].map((m) => ({ months: m, target: m * 1000, short_by: m * 1000 - 2500 })) } })),
    http.post('*/api/v1/learnpal/lessons/a-starter-buffer/quiz', async ({ request }) => {
      posted = await request.json();
      return HttpResponse.json({ success: true, recorded: 2 });
    }),
  );
});

const Harness = ({ slug }: { slug: string }) => {
  const r = useLessonReader();
  return <>
    <button onClick={() => r.open({ slug, title: 't', has_body: true })}>open</button>
    {r.panel}
  </>;
};
const mount = async (slug = 'a-starter-buffer') => {
  render(<MemoryRouter><Harness slug={slug} /></MemoryRouter>);
  await userEvent.click(screen.getByText('open'));
  await screen.findByText(/A small pot|Look at the shape/);
};

describe('the quick check', () => {
  it('waits to be asked: the lesson opens with an invitation, not a question', async () => {
    await mount();
    expect(screen.getByTestId('lesson-quiz').dataset.state).toBe('invite');
    expect(screen.queryByText('What is a starter buffer for?')).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing is scored/)).toBeInTheDocument();
  });

  it('explains every answer, keeps Not sure from being wrong, and ends with no score and one action', async () => {
    await mount();
    await userEvent.click(screen.getByTestId('quiz-start'));
    expect(screen.getByTestId('lesson-quiz').dataset.state).toBe('ask');

    await userEvent.click(screen.getByTestId('quiz-option-1'));
    const why = screen.getByTestId('quiz-explanation');
    expect(why.dataset.right).toBe('false');
    expect(why.textContent).toContain('That is a different pot');
    expect(why.textContent).not.toMatch(/wrong|incorrect/i);
    await userEvent.click(screen.getByTestId('quiz-next'));

    await userEvent.click(screen.getByTestId('quiz-option-not-sure'));
    expect(screen.getByTestId('quiz-explanation').textContent).toContain('Small: one bill, not six months.');
    await userEvent.click(screen.getByTestId('quiz-next'));

    const end = screen.getByTestId('lesson-quiz');
    expect(end.dataset.outcome).toBe('another-look');
    expect(end.textContent).toContain('This is worth another look');
    expect(end.textContent).not.toMatch(/\d\s*(of|\/)\s*\d|score|%/i);
    expect(screen.getByTestId('quiz-action').getAttribute('href')).toBe('/goals');
    await waitFor(() => expect(posted).toEqual({ answers: [
      { question_id: 'q1', choice: '1' }, { question_id: 'q2', choice: 'not_sure' }] }));
  });

  it("says You've got this one when every answer is right", async () => {
    await mount();
    await userEvent.click(screen.getByTestId('quiz-start'));
    await userEvent.click(screen.getByTestId('quiz-option-0'));
    expect(screen.getByTestId('quiz-explanation').dataset.right).toBe('true');
    await userEvent.click(screen.getByTestId('quiz-next'));
    await userEvent.click(screen.getByTestId('quiz-option-1'));
    await userEvent.click(screen.getByTestId('quiz-next'));
    expect(screen.getByTestId('lesson-quiz').dataset.outcome).toBe('got-it');
    expect(screen.getByText("You've got this one")).toBeInTheDocument();
  });

  it('is absent from a lesson that has none', async () => {
    await mount('where-your-money-goes');
    expect(screen.queryByTestId('lesson-quiz')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lesson-buffer-calculator')).not.toBeInTheDocument();
  });
});

describe('the emergency-fund lessons carry the calculator', () => {
  it('shows what 3, 6 and 9 months would take, with no target to pick', async () => {
    await mount();
    const calc = await screen.findByTestId('buffer-calculator');
    expect(screen.getByTestId('lesson-buffer-calculator')).toContainElement(calc);
    expect(screen.getByTestId('buffer-target-3').textContent).toContain('$3,000.00');
    expect(screen.getByTestId('buffer-target-6').textContent).toContain('$6,000.00');
    expect(screen.getByTestId('buffer-target-9').textContent).toContain('$9,000.00');
    expect(screen.getByTestId('buffer-target-9').tagName).toBe('DIV');
  });
});
