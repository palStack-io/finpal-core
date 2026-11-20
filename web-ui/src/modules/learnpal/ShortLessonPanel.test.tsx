import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../__tests__/mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { ShortLessonPanel, SkillDots } from './ShortLessonPanel';
import type { ShortLesson } from '../../types/learnpal';

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

const LESSON: ShortLesson = {
  id: 'interest', skill: 'interest', long_lesson: 'what-your-apr-costs',
  number: '$38.00 of October\'s payment went to interest on Visa.',
  explain: ['Interest arrives like a monthly bill.', 'Extra payments cut it for good.'],
  try: {
    kind: 'interest', balance: '1860.00', apr: '24.99', interest_month: '38.00',
    base_payment: '60.00', covers_interest: true,
    points: [
      { extra: 0, months: 40, interest_total: '800.00' },
      { extra: 10, months: 30, interest_total: '600.00' },
      { extra: 20, months: null, interest_total: null },
    ],
  },
  action: { label: 'See your cards', href: '/accounts' }, when: true,
  lines: { not_now: "Fine. It'll be here when you want it.", understood: 'You have the idea.',
           when_prompt: 'When would you like to do this?' },
};
const ROW = { id: 'interest', title: 'Understand interest',
              marks: { understood: true, used: false, remembered: false } };

const posts: unknown[] = [];
const serve = (lesson: ShortLesson = LESSON) => {
  posts.length = 0;
  server.use(
    http.get('*/api/v1/learnpal/short/:id', () => HttpResponse.json(lesson)),
    http.post('*/api/v1/learnpal/short/:id/finish', async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json(ROW);
    }),
  );
};
const draw = (onClose = vi.fn(), onFinished = vi.fn()) => {
  render(<MemoryRouter><ShortLessonPanel shortId="interest" onClose={onClose} onFinished={onFinished} /></MemoryRouter>);
  return { onClose, onFinished };
};
const toStep4 = async () => {
  await screen.findByTestId('short-number');
  for (let i = 0; i < 3; i++) await userEvent.click(screen.getByTestId('short-next'));
};

describe('ShortLessonPanel', () => {
  it('opens on step 1 with the server number text and announces progress', async () => {
    serve(); draw();
    expect(await screen.findByText(LESSON.number)).toBeTruthy();
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
  });

  it('Next reaches step 4 and moves focus to the step heading', async () => {
    serve(); draw();
    await screen.findByTestId('short-number');
    await userEvent.click(screen.getByTestId('short-next'));
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    expect(document.activeElement?.tagName).toBe('H3');
    await userEvent.click(screen.getByTestId('short-next'));
    await userEvent.click(screen.getByTestId('short-next'));
    expect(screen.getByText('Step 4 of 4')).toBeTruthy();
    expect(screen.getByTestId('short-action').textContent).toBe('See your cards');
    await userEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
  });

  it('records finished on reaching step 4 and shows the skill row', async () => {
    serve(); const { onFinished } = draw();
    await toStep4();
    await waitFor(() => expect(onFinished).toHaveBeenCalled());
    expect(posts).toEqual([{ outcome: 'finished' }]);
    expect(await screen.findByTestId('skill-row')).toBeTruthy();
  });

  it('Not now posts not_now and closes', async () => {
    serve(); const { onClose } = draw();
    await toStep4();
    await userEvent.click(screen.getByTestId('short-not-now'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts).toContainEqual({ outcome: 'not_now' });
  });

  it('the action posts action, then navigates to its href', async () => {
    serve(); const { onClose } = draw();
    await toStep4();
    await userEvent.click(screen.getByTestId('short-action'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/accounts', { state: undefined }));
    expect(posts).toContainEqual({ outcome: 'action' });
    expect(onClose).toHaveBeenCalled();
  });

  it('the slider at index k shows points[k]', async () => {
    serve(); draw();
    await screen.findByTestId('short-number');
    await userEvent.click(screen.getByTestId('short-next'));
    await userEvent.click(screen.getByTestId('short-next'));
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '1' } });
    expect(screen.getByTestId('try-extra-value').textContent).toBe('$10.00');
    const result = screen.getByTestId('try-result').textContent as string;
    expect(result).toContain('$70.00');
    expect(result).toContain('$600.00');
    expect(result).toContain('$200.00'); // saved
    fireEvent.change(slider, { target: { value: '2' } });
    expect(screen.getByTestId('try-result').textContent)
      .toContain("This payment doesn't get ahead of the interest yet");
  });

  it('other kinds are read-only: no slider', async () => {
    serve({ ...LESSON, id: 'month',
            try: { kind: 'month', income: '3000.00', spent: '2500.00',
                   biggest_category: 'Rent', biggest_amount: '1200.00' } });
    draw();
    await screen.findByTestId('short-number');
    await userEvent.click(screen.getByTestId('short-next'));
    await userEvent.click(screen.getByTestId('short-next'));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText('Biggest: Rent')).toBeTruthy();
  });

  it('links to the long lesson and never says "wrong"', async () => {
    serve(); draw();
    await screen.findByTestId('short-number');
    expect(screen.getByTestId('short-read-more').getAttribute('data-lesson')).toBe('what-your-apr-costs');
    for (let i = 0; i < 3; i++) {
      expect(document.body.textContent).not.toMatch(/wrong/i);
      await userEvent.click(screen.getByTestId('short-next'));
    }
    expect(document.body.textContent).not.toMatch(/wrong/i);
  });
});

describe('SkillDots', () => {
  it('labels the three marks', () => {
    render(<SkillDots marks={{ understood: true, used: false, remembered: false }} />);
    expect(screen.getByLabelText('Understood, not yet used, not yet remembered')).toBeTruthy();
  });
});
