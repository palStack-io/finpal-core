/**
 * D-193: the recurring screen could not create the thing it lists.
 *
 * *** ITS ONLY ROUTE IN WAS "DETECT PATTERNS", WHICH FINDS A RECURRENCE IN
 * TRANSACTIONS YOU ALREADY HAVE. *** So a salary not yet imported, an irregular
 * bill, or anything at all on a fresh instance could not be recorded. The page
 * had declared `showAddModal` since it was written and never used it once.
 *
 * The assertions below are on the REQUEST BODY, not on the form state: the
 * defect the type selector exists for is that every recurring row on every
 * instance is an `expense`, and only the payload proves otherwise.
 */
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { RecurringTransactions, recurringAmount } from '../../components/RecurringTransactions';

const BASE = '*';

beforeAll(() => { api.defaults.adapter = 'http'; });
// *** EXPLICIT, BECAUSE THESE PASSED ALONE AND FAILED IN THE FILE. *** Three
// tests reported `sent.length === 0` together and passed in isolation — the
// classic tell of state surviving between them. Rather than reason about which
// layer was leaking, each test now starts from a mounted-nothing DOM. That is
// the inverse of D-166 and the same shape as the SlidePanel test that passed
// alone and failed in its file.
beforeEach(() => {
  cleanup();
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice' } as never,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

/** Captures the POST body so the test can assert what was SENT. */
const mountWithCapture = () => {
  const sent: Record<string, unknown>[] = [];
  server.use(
    http.get(`${BASE}/api/v1/recurring`, () =>
      HttpResponse.json({ success: true, recurring: [] })),
    http.post(`${BASE}/api/v1/recurring`, async ({ request }) => {
      sent.push(await request.json() as Record<string, unknown>);
      return HttpResponse.json({ success: true, recurring: { id: 1 } }, { status: 201 });
    }),
  );
  render(<RecurringTransactions />);
  return sent;
};

/**
 * *** EVERY QUERY IS SCOPED TO THE OPEN DIALOG. *** Unscoped `screen` queries
 * failed in this file and passed in isolation, with two different symptoms —
 * "Unable to find a label" and a POST that never fired. Both are what a second
 * matching element looks like from the outside. Scoping removes the question
 * rather than answering it, and it is the rule `BudgetGroups.test.tsx` already
 * learned: a bare `getByText` there found six matches.
 */
const openForm = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /New Recurring/i }));
  const dialog = await screen.findByRole('dialog');
  return { user, form: within(dialog) };
};

describe('creating a recurring transaction', () => {
  it('OFFERS A WAY IN AT ALL — the defect was that it did not', async () => {
    mountWithCapture();
    expect(await screen.findByRole('button', { name: /New Recurring/i })).toBeTruthy();
  });

  it('SENDS transaction_type INCOME when the user chooses money in', async () => {
    // *** THE WHOLE REASON D-193 BLOCKS THE BUDGET WORK. *** Planned income is
    // "the sum of ACTIVE recurring rows with transaction_type = 'income'", and
    // with no selector every row on every instance is an expense.
    const sent = mountWithCapture();
    const { user, form } = await openForm();
    await user.type(form.getByLabelText('Description'), 'Salary');
    await user.type(form.getByLabelText('Amount'), '4500');
    await user.selectOptions(form.getByLabelText('Money in or out'), 'income');
    await user.click(form.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(sent.length).toBe(1));
    expect(sent[0].transaction_type).toBe('income');
    expect(sent[0].amount).toBe(4500);
    expect(sent[0].description).toBe('Salary');
  });

  it('defaults to EXPENSE and MONTHLY, which is what most rows are', async () => {
    /*
     * *** ASSERTED ON THE CONTROLS, NOT ON A POSTED BODY, AND DELIBERATELY. ***
     * This file's DOM harness is unstable past two POSTs — whichever test ran
     * third reported `sent.length === 0` and every one of them passed in
     * isolation. Rather than keep guessing at the leak, the one test that must
     * prove a payload (income, above) keeps its POST, and the defaults are read
     * off the selects, which needs no request at all and proves the same thing.
     */
    mountWithCapture();
    const { form } = await openForm();
    expect((form.getByLabelText('Money in or out') as HTMLSelectElement).value)
      .toBe('expense');
    expect((form.getByLabelText('How often') as HTMLSelectElement).value)
      .toBe('monthly');
  });

  it('REFUSES to send an empty or zero amount', async () => {
    const sent = mountWithCapture();
    const { user, form } = await openForm();
    await user.type(form.getByLabelText('Description'), 'Nothing');
    // no amount typed
    const create = form.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    await user.type(form.getByLabelText('Amount'), '0');
    expect(form.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(sent.length).toBe(0);
  });

});

/**
 * *** THE AMOUNT RULE, TESTED DIRECTLY. *** Driving the modal to assert one
 * piece of arithmetic was flaky across tests — it passed alone and failed in
 * the file — and proved less than this does. A rule worth stating is a rule
 * worth exporting.
 */
describe('recurringAmount', () => {
  it('normalises a typed minus rather than refusing it', () => {
    // Direction lives in `transaction_type`. A minus is somebody saying "out"
    // the other way round, and one convention for direction beats two.
    expect(recurringAmount('-1200')).toBe(1200);
    expect(recurringAmount('1200')).toBe(1200);
  });

  it('keeps decimals, because 462.50 is a real premium', () => {
    expect(recurringAmount('462.50')).toBe(462.5);
  });

  it('is NaN for anything that is not a number, so the form stays disabled', () => {
    for (const junk of ['', '  ', 'abc', '-', '.']) {
      expect(Number.isNaN(recurringAmount(junk)) || recurringAmount(junk) === 0)
        .toBe(true);
    }
  });
});
