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
  id: 'interest', skill: 'interest', skill_title: 'Understand interest', long_lesson: 'what-your-apr-costs',
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
  it('draws the lesson\'s own chart under the number, and months to clear on the try step', async () => {
    const points = [0, 10, 20, 30, 40].map((extra, i) => ({
      extra, months: [40, 30, 24, 20, 17][i], interest_total: ['800.00', '600.00', '480.00', '400.00', '340.00'][i] }));
    serve({ ...LESSON, try: { ...LESSON.try, points } as ShortLesson['try'] }); draw();
    await screen.findByTestId('short-number');
    expect(screen.getByRole('img', { name: '$38.00 of a $60.00 payment goes to interest, $22.00 off the balance.' }))
      .toBeInTheDocument();
    await userEvent.click(screen.getByTestId('short-next'));
    expect(screen.queryByTestId('lesson-chart')).toBeNull();
    await userEvent.click(screen.getByTestId('short-next'));
    expect(screen.getByTestId('months-to-clear')).toBeInTheDocument();
  });

  it('a lesson whose figures are missing shows its sentence and no chart', async () => {
    serve({ ...LESSON, try: { ...LESSON.try, interest_month: undefined } as unknown as ShortLesson['try'] }); draw();
    expect(await screen.findByText(LESSON.number)).toBeTruthy();
    expect(screen.queryByTestId('lesson-chart')).toBeNull();
  });

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

  it('Not now posts not_now, shows the not-now line, and closes only on Close', async () => {
    serve(); const { onClose } = draw();
    await toStep4();
    await userEvent.click(screen.getByTestId('short-not-now'));
    expect((await screen.findByTestId('short-not-now-line')).textContent).toBe(LESSON.lines.not_now);
    expect(posts).toContainEqual({ outcome: 'not_now' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('short-action')).toBeNull();
    await userEvent.click(screen.getByTestId('short-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('a double click on the action posts and navigates once, and disables the buttons', async () => {
    serve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    server.use(http.post('*/api/v1/learnpal/short/:id/finish', async ({ request }) => {
      const body = await request.json() as { outcome: string };
      posts.push(body);
      if (body.outcome === 'action') await gate;
      return HttpResponse.json(ROW);
    }));
    draw();
    await toStep4();
    const action = screen.getByTestId('short-action');
    fireEvent.click(action); fireEvent.click(action);
    await waitFor(() => expect((screen.getByTestId('short-action') as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByTestId('short-not-now') as HTMLButtonElement).disabled).toBe(true);
    release();
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(posts.filter((p) => (p as { outcome: string }).outcome === 'action')).toHaveLength(1);
  });

  it('uses the skill title as the panel title and has no when choice', async () => {
    serve(); draw();
    await screen.findByTestId('short-number');
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByText('Understand interest')).toBeTruthy();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByTestId('short-next'));
    expect(screen.queryByText('On payday')).toBeNull();
  });

  it('shows loading first', () => {
    serve(); draw();
    expect(screen.getByText(/Loading/)).toBeTruthy();
  });

  it('a 404 says the lesson no longer applies', async () => {
    server.use(http.get('*/api/v1/learnpal/short/:id', () => HttpResponse.json({ success: false }, { status: 404 })));
    draw();
    expect(await screen.findByText("This one doesn't apply to your numbers right now.")).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('another error offers a retry that loads the lesson', async () => {
    server.use(http.get('*/api/v1/learnpal/short/:id', () => HttpResponse.json({}, { status: 500 })));
    draw();
    expect(await screen.findByText("We couldn't load this lesson. Try again in a moment.")).toBeTruthy();
    serve();
    await userEvent.click(screen.getByText('Try again'));
    expect(await screen.findByTestId('short-number')).toBeTruthy();
  });

  it('payoff month does not overflow from the 31st', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2027, 0, 31) });
    try {
      serve({ ...LESSON, try: { ...(LESSON.try as object), points: [{ extra: 0, months: 1, interest_total: '5.00' }] } as never });
      draw();
      await screen.findByTestId('short-number');
      fireEvent.click(screen.getByTestId('short-next')); fireEvent.click(screen.getByTestId('short-next'));
      const month = new Date(2027, 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      expect(screen.getByTestId('try-result').textContent).toContain(month);
    } finally { vi.useRealTimers(); }
  });

  it('the action posts action, then navigates to its href', async () => {
    serve(); const { onClose } = draw();
    await toStep4();
    await userEvent.click(screen.getByTestId('short-action'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/accounts'));
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

  it('"Came in" names the month the income is from (UI audit 2026-11-20, P1-5)', async () => {
    serve({ ...LESSON, id: 'month',
            try: { kind: 'month', income: '5200.00', spent: '2536.54',
                   biggest_category: 'Housing', biggest_amount: '1800.00', month: 'October' } });
    draw();
    await screen.findByTestId('short-number');
    await userEvent.click(screen.getByTestId('short-next'));
    await userEvent.click(screen.getByTestId('short-next'));
    expect(screen.getByText('Came in, October')).toBeTruthy();
    expect(screen.getByText('Went out, October')).toBeTruthy();
    expect(screen.queryByText('Came in')).toBeNull();
  });

  it('links to the long lesson and never says "wrong"', async () => {
    serve(); draw();
    await screen.findByTestId('short-number');
    expect(screen.getByTestId('short-read-more').getAttribute('href')).toBe('/learnpal/lessons?lesson=what-your-apr-costs');
    // UX audit 2026-11-20 P0-2: was the browser's default blue (1.7:1 on the dark panel). The theme's
    // link ink is 5.27:1 light and 6.94:1 dark on the card.
    const readMore = screen.getByTestId('short-read-more');
    expect(readMore.style.color).toBe('var(--g-ink)');
    expect(readMore.style.fontWeight).toBe('600');
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

describe('ShortLessonPanel money', () => {
  const buffer = (currency?: string): ShortLesson => ({
    ...LESSON, id: 'buffer', skill: 'buffer',
    try: { kind: 'buffer', ...(currency ? { currency } : {}), essential_monthly: '3065.00', held: '1530.00',
           buffer_amount: '1530.00', targets: [{ months: 3, target: '9195.00' }] },
  });
  const toStep3 = async () => {
    await screen.findByTestId('short-number');
    for (let i = 0; i < 2; i++) await userEvent.click(screen.getByTestId('short-next'));
  };

  it("formats step 3 with the try block's currency (GBP shows a pound sign)", async () => {
    serve(buffer('GBP')); draw();
    await toStep3();
    expect(screen.getByText('£3,065.00')).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("falls back to the person's currency from the auth store", async () => {
    useAuthStore.setState({
      user: { id: 'a@test.com', name: 'A', default_currency_code: 'EUR' } as never, token: 't',
      refreshToken: 'r', isAuthenticated: true,
    });
    serve(buffer()); draw();
    await toStep3();
    expect(screen.getByText(/€\s?3,065\.00|3,065\.00\s?€/)).toBeTruthy();
  });

  it('formats the interest slider in the try currency', async () => {
    serve({ ...LESSON, try: { ...(LESSON.try as object), currency: 'GBP' } as never }); draw();
    await toStep3();
    expect(screen.getByTestId('try-extra-value').textContent).toBe('£0.00');
  });
});
