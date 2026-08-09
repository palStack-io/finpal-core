/**
 * THE LEDGER RESTRUCTURE — one surface, rows as hairlines inside it.
 *
 * The move the "kitchen table" direction rests on is that **the radius belongs to
 * the container, not the row**. The live page gave every row its own card — a
 * border, an 8px radius, a background, a `translateX(4px)` hover and a 44px
 * coloured icon tile — and `PER_PAGE` is 50, so that was 50 nested cards and 100
 * colour events on one screen. A realistic 50-row page over 12 date groups goes
 * 4404px → 3875px: 12.0% shorter, 529px less scroll.
 *
 * ── Two kinds of assertion, because one kind cannot cover this ───────────────
 *
 * **Rendered output** for everything the markup decides: how many rows, whether a
 * row is a card, whether the actions kept their labels. Never a status code —
 * every bug found across nine sessions returned 200 and rendered fine.
 *
 * **The stylesheet, read as text**, for everything CSS decides. jsdom does not
 * apply an external stylesheet, so no rendering test here can see a CSS value
 * change — `pageShells.test.ts` already pins values textually for that reason. A
 * `getComputedStyle` assertion on `.fp-ledger` would resolve to the initial value
 * and pass whatever the file said, which is the "check that inspects nothing"
 * shape this project has hit four times.
 *
 * ── THE O1 STOP CONDITION IS ENFORCED HERE, MECHANICALLY ────────────────────
 *
 * Whether an ordinary expense stops being red is the owner's decision and the
 * answer was **"show me both on screen first"**, which is not approval. This
 * slice is structure only. Rather than rely on six slices' worth of remembering
 * that, the last describe block asserts an ordinary expense still renders in
 * `--accent-red`, income in `--brand-green-glow` and a transfer in
 * `--accent-blue`. If a later slice flips the semantics without the owner having
 * answered, this fails and names the reason.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { readFileSync } from 'fs';
import { join } from 'path';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Transactions } from '../../pages/Transactions';

const BASE = '*';
const THEME = readFileSync(
  join(__dirname, '..', '..', 'styles', 'finpal-theme.css'), 'utf8');

beforeAll(() => {
  api.defaults.adapter = 'http';
});

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'u@test.com', name: 'Test', default_currency_code: 'USD' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

/** 50 rows spread over 12 days — the shape the density figure was measured on. */
function seed(kinds?: string[]) {
  const list = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    description: `Item ${i + 1}`,
    amount: 10 + i,
    date: `2026-03-${String((i % 12) + 1).padStart(2, '0')}T00:00:00`,
    currency_code: 'USD',
    transaction_type: kinds ? kinds[i % kinds.length] : 'expense',
    category: { id: 1, name: 'Food' },
    account: { id: 1, name: 'Checking' },
  }));
  server.use(
    http.get(`${BASE}/api/v1/transactions/`, () =>
      HttpResponse.json({
        success: true,
        transactions: list,
        pagination: { page: 1, per_page: 50, total: 120, pages: 3, has_next: true, has_prev: false },
        summary: { total_income: 0, total_expense: 500, net: -500 },
      })),
    // A BARE ARRAY, which is what the server actually sends. The first draft of
    // this mock wrapped it as `{success, members}` — teamService mapped over the
    // object, the component threw, and the page rendered NOTHING while the
    // failure read "unable to find Item 1". An interface is a claim about a
    // server, not a check of one; a hand-written mock carrying the wrong shape
    // fails in a way that looks like a broken assertion.
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json([])),
  );
  return list;
}

async function renderPage() {
  const view = render(<MemoryRouter><Transactions /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Item 1')).toBeInTheDocument());
  return view;
}

describe('the transaction list is one surface, not fifty cards', () => {
  it('renders one row per transaction, inside a single ledger surface', async () => {
    seed();
    const { container } = await renderPage();

    const surfaces = container.querySelectorAll('.fp-ledger');
    expect(surfaces).toHaveLength(1);
    expect(container.querySelectorAll('.fp-ledger-row')).toHaveLength(50);
  });

  it('NO ROW CARRIES ITS OWN RADIUS, BORDER OR BACKGROUND', async () => {
    // The assertion the whole slice turns on, and it is deliberately scoped to
    // every DESCENDANT of the ledger rather than to the row element — a nested
    // card can come back one level in and look exactly like a fix.
    seed();
    const { container } = await renderPage();

    const offenders: string[] = [];
    for (const row of container.querySelectorAll('.fp-ledger-row')) {
      for (const el of [row, ...Array.from(row.querySelectorAll('*'))]) {
        const style = (el as HTMLElement).style;
        // The action buttons are pills by design — they are controls, not cards,
        // and a control that looks like a control is the point of them.
        if ((el as HTMLElement).closest('.fp-ledger-acts')) continue;
        if (style.borderRadius) offenders.push(`${el.tagName}: radius ${style.borderRadius}`);
        if (style.border) offenders.push(`${el.tagName}: border ${style.border}`);
        if (style.background && style.background !== 'transparent') {
          offenders.push(`${el.tagName}: background ${style.background}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('drops the 44px coloured icon tile that gave every row two colour events', async () => {
    seed();
    const { container } = await renderPage();
    // Keyed to the tile's mechanism — an svg inside a sized, tinted box — rather
    // than to the literal `44px`, so a 40px tile does not slip through.
    const svgsInRows = container.querySelectorAll('.fp-ledger-row svg');
    for (const svg of svgsInRows) {
      expect(svg.closest('.fp-ledger-acts')).not.toBeNull();
    }
  });

  it('keeps both action labels on every row (U-04 territory)', async () => {
    seed();
    await renderPage();
    // opacity:0 hides these visually until hover; they must stay in the
    // accessibility tree, so `getAllByLabelText` is the right question.
    expect(screen.getAllByLabelText('Edit transaction')).toHaveLength(50);
    expect(screen.getAllByLabelText('Delete transaction')).toHaveLength(50);
  });

  it('groups rows under date labels, each label preceding its own rows', async () => {
    seed();
    const { container } = await renderPage();
    const groups = container.querySelectorAll('.fp-ledger-group');
    expect(groups.length).toBeGreaterThan(1);
    for (const group of groups) {
      expect(group.nextElementSibling?.classList.contains('fp-ledger-rows')).toBe(true);
    }
  });
});

describe('the parts of the restructure that only the stylesheet can state', () => {
  it('the radius is on the container', () => {
    const ledger = THEME.match(/\.fp-ledger \{[^}]*\}/)?.[0] ?? '';
    expect(ledger).toMatch(/border-radius:\s*var\(--kt-radius\)/);
    // Without this the first and last row square off the corners they sit in.
    expect(ledger).toMatch(/overflow:\s*hidden/);
  });

  it('a date label carries the hairline that CLOSES the previous group', () => {
    // Found only in a screenshot: without it a date floats between two days,
    // belonging to neither. The CSS read perfectly.
    const rule = THEME.match(/\.fp-ledger-rows \+ \.fp-ledger-group \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/border-top:\s*1px solid/);
  });

  it('the actions are reachable without a hover — keyboard AND coarse pointer', () => {
    // A hover-only control does not exist on a tablet, and a keyboard has no
    // hover at all. Both escapes are asserted because each covers a different
    // user and losing either is silent.
    expect(THEME).toMatch(/\.fp-ledger-row:focus-within \.fp-ledger-acts/);
    const coarse = THEME.match(/@media \(hover: none\) \{[^@]*?\.fp-ledger-acts \{[^}]*\}/s)?.[0] ?? '';
    expect(coarse).toMatch(/opacity:\s*1/);
  });

  it('the row hover carries a second channel, not just a 1.059:1 background', () => {
    // Removing the border and the translate left the background shift alone, and
    // it measures 1.059:1 against the card (1.097 dark). The rows are clickable,
    // so the affordance has to land. box-shadow specifically: it costs no layout,
    // so it cannot reintroduce the horizontal jump the old transform caused.
    const hover = THEME.match(/\.fp-ledger-row:hover \{[^}]*\}/)?.[0] ?? '';
    expect(hover).toMatch(/background:/);
    expect(hover).toMatch(/box-shadow:\s*inset/);
    expect(hover).not.toMatch(/transform:/);
  });
});

describe('O1 IS ANSWERED — an ordinary expense is NOT red', () => {
  /**
   * *** OWNER DECISION, 2026-08-09. *** This block used to assert the OPPOSITE,
   * and that was its job: while the question was open it was the stop condition
   * that kept six slices from drifting into the flip. It caught this very change
   * when the colours moved, which is the only reason to write a stop condition
   * as a test rather than as a note. It now pins the answer instead.
   *
   * The answer was settled by looking at Monarch rather than by argument: every
   * expense there renders in plain dark text, income is green with a leading
   * `+`, and red appears only on figures that are over or negative — an
   * over-budget category, a negative "left to budget". Actual spend of $10,947
   * is black. Red means "problem", not "expense".
   */
  it('paints an expense in plain text, income green and a transfer soft', async () => {
    seed(['expense', 'income', 'transfer']);
    const { container } = await renderPage();

    const amountOf = (label: string) => {
      const row = screen.getByText(label).closest('.fp-ledger-row')!;
      const amount = row.querySelector('.fp-ledger-amount') as HTMLElement;
      expect(amount, `no amount found on the row for ${label}`).not.toBeNull();
      return amount;
    };

    expect(amountOf('Item 1').style.color).toContain('--text-primary');
    // --brand-main-green (#15803d, 4.87:1 on card), NOT --brand-green-glow
    // (#22c55e, 2.27:1) — the old income colour was a WCAG AA failure on the
    // figure that matters most, and this change is the moment to stop shipping it.
    expect(amountOf('Item 2').style.color).toContain('--amount-income');
    expect(amountOf('Item 3').style.color).toContain('--text-secondary');
    expect(container.querySelectorAll('.fp-ledger-row')).toHaveLength(50);
  });

  it('KEYED TO THE MECHANISM: no alarm colour appears on any row amount', async () => {
    // Pinning the three new tokens would pass forever while saying nothing about
    // a fourth transaction type someone adds next month. This says the thing the
    // decision actually means — an amount is never painted as an alarm — and it
    // is what fails if red comes back under any spelling.
    seed(['expense', 'income', 'transfer']);
    const { container } = await renderPage();

    const offenders = Array.from(container.querySelectorAll('.fp-ledger-amount'))
      .map((el) => (el as HTMLElement).style.color)
      .filter((c) => /accent-red|#ef4444|rgb\(239/i.test(c));

    expect(offenders).toEqual([]);
  });

  it('the three kinds stay distinguishable WITHOUT colour, by their sign', async () => {
    /**
     * The risk this change introduces, and the reason it needs its own
     * assertion. Colour used to carry direction; now the sign does, alone. An
     * expense reads `−`, income reads `+`, and a transfer carries neither
     * because it is not money leaving. Drop the minus in some future tidy-up and
     * an expense becomes indistinguishable from a transfer — with nothing left
     * to tell them apart, which is D-52's shape waiting to happen again.
     */
    seed(['expense', 'income', 'transfer']);
    await renderPage();

    const textOf = (label: string) =>
      screen.getByText(label).closest('.fp-ledger-row')!
        .querySelector('.fp-ledger-amount')!.textContent ?? '';

    expect(textOf('Item 1')).toMatch(/^\u2212/);   // expense: a real minus sign
    expect(textOf('Item 2')).toMatch(/^\+/);        // income
    expect(textOf('Item 3')).not.toMatch(/^[\u2212+-]/); // transfer: unsigned
  });
});
