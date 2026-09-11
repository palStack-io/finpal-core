/**
 * APR capture — the control, and the three pure functions around it.
 *
 * *** `Account.apr` HAS BEEN NULL FOR EVERY USER ON EVERY INSTANCE SINCE B1
 * ADDED IT. *** The API accepts it on both verbs, both service layers type it,
 * the demo seeder writes it, and no client ever had an input. That is what these
 * assert: not that a component renders, but that a value typed into it survives
 * the round trip in a shape the server will take and the next open will show.
 *
 * The conversion helpers get the most attention because every one of the ways
 * this can silently fail lives in them: `Number('')` is `0`, so clearing a limit
 * would set it to zero; `|| ''` on the way back would blank a real 0% APR and
 * then write NULL over it; and omitting a key on a PUT leaves the old value in
 * place with no error, because the handler is `if 'apr' in data`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CreditFieldsControl,
  creditFieldsPayload,
  creditFieldsFromAccount,
  creditFieldErrors,
  APR_MAX,
} from '../../components/forms/CreditFieldsControl';

const EMPTY = { creditLimit: '', apr: '', minPayment: '' };

const renderControl = (props: Partial<React.ComponentProps<typeof CreditFieldsControl>> = {}) => {
  const onChange = vi.fn();
  render(
    <CreditFieldsControl
      values={EMPTY}
      onChange={onChange}
      currencySymbol="$"
      accountType="credit"
      {...props}
    />,
  );
  return { onChange };
};

// ---------------------------------------------------------------------------
// The payload — where a value goes to die
// ---------------------------------------------------------------------------

describe('creditFieldsPayload', () => {
  it('sends null for an empty box, NOT zero', () => {
    // `Number('')` is 0. Without the empty check first, clearing a credit limit
    // would set it to zero and every card would render as maxed out.
    expect(creditFieldsPayload(EMPTY)).toEqual({
      credit_limit: null, apr: null, min_payment: null,
    });
  });

  it('sends null rather than omitting, so a cleared field is actually cleared', () => {
    // The PUT handler is `if 'apr' in data`. An omitted key leaves the stored
    // value untouched, so a user who clears the box and saves would reopen the
    // form and find the old rate still there, with no error to explain it.
    const payload = creditFieldsPayload({ ...EMPTY, apr: '' });
    expect('apr' in payload).toBe(true);
    expect(payload.apr).toBeNull();
  });

  it('keeps a real ZERO, which is a 0% intro rate', () => {
    expect(creditFieldsPayload({ creditLimit: '0', apr: '0', minPayment: '0' }))
      .toEqual({ credit_limit: 0, apr: 0, min_payment: 0 });
  });

  it('parses decimals rather than truncating them', () => {
    // 19.99 is the canonical APR and the reason the column is Numeric(5,2) and
    // not Float — see `test_apr_survives_the_round_trip_exactly`.
    expect(creditFieldsPayload({ ...EMPTY, apr: '19.99' }).apr).toBe(19.99);
  });

  it('tolerates surrounding whitespace', () => {
    expect(creditFieldsPayload({ ...EMPTY, apr: '  24.49  ' }).apr).toBe(24.49);
  });

  it('sends null rather than NaN for a non-numeric string', () => {
    expect(creditFieldsPayload({ ...EMPTY, apr: 'abc' }).apr).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The prefill — the other direction, and the `||` trap
// ---------------------------------------------------------------------------

describe('creditFieldsFromAccount', () => {
  it('shows what is stored, so an unrelated edit cannot blank it', () => {
    expect(creditFieldsFromAccount({ creditLimit: 5000, apr: 19.99, minPayment: 35 }))
      .toEqual({ creditLimit: '5000', apr: '19.99', minPayment: '35' });
  });

  it('*** KEEPS A STORED ZERO VISIBLE ***', () => {
    // `|| ''` here would open the form with an empty APR box on a 0% card and
    // then write NULL back over it on the next save — the field would destroy
    // itself on an edit the user did not make.
    expect(creditFieldsFromAccount({ apr: 0, creditLimit: 0, minPayment: 0 }))
      .toEqual({ creditLimit: '0', apr: '0', minPayment: '0' });
  });

  it('treats null and undefined alike as "not stated"', () => {
    expect(creditFieldsFromAccount({ apr: null })).toEqual(EMPTY);
    expect(creditFieldsFromAccount({})).toEqual(EMPTY);
  });

  it('round-trips: stored -> form -> payload is the same number', () => {
    const stored = { creditLimit: 3000, apr: 0, minPayment: 25 };
    expect(creditFieldsPayload(creditFieldsFromAccount(stored)))
      .toEqual({ credit_limit: 3000, apr: 0, min_payment: 25 });
  });
});

// ---------------------------------------------------------------------------
// The server's refusal, re-keyed
// ---------------------------------------------------------------------------

describe('creditFieldErrors', () => {
  const refusal = (details: unknown) => ({ response: { data: { error: 'Validation error', details } } });

  it('maps the column name onto the form field', () => {
    expect(creditFieldErrors(refusal({
      apr: ['Must be greater than or equal to 0 and less than or equal to 999.99.'],
    }))).toEqual({
      apr: 'Must be greater than or equal to 0 and less than or equal to 999.99.',
    });
  });

  it('maps both snake_case fields', () => {
    expect(creditFieldErrors(refusal({
      credit_limit: ['nope'], min_payment: ['also nope'],
    }))).toEqual({ creditLimit: 'nope', minPayment: 'also nope' });
  });

  it('ignores fields that are not this control\'s', () => {
    expect(creditFieldErrors(refusal({ name: ['too long'] }))).toEqual({});
  });

  it('is safe on a network error with no response at all', () => {
    expect(creditFieldErrors(new Error('Network Error'))).toEqual({});
    expect(creditFieldErrors(undefined)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// The rendered control
// ---------------------------------------------------------------------------

describe('CreditFieldsControl', () => {
  it('offers all three inputs for a credit card', () => {
    renderControl();
    expect(screen.getByLabelText(/credit limit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/APR/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum payment/i)).toBeInTheDocument();
  });

  it('*** CALLS A LOAN A LOAN ***', () => {
    // A loan has a rate too, and reading "credit fields" as "credit cards" would
    // have left every car loan and student loan without one — which is half the
    // accounts learnPal needs a rate for.
    renderControl({ accountType: 'loan' });
    expect(screen.getByLabelText(/original amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/monthly payment/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/APR/i)).toBeInTheDocument();
  });

  it('says the fields are optional, in words', () => {
    // A form that demands three numbers with no explanation gets three blank
    // fields, and a NULL apr is the state this whole slice exists to end.
    renderControl();
    expect(screen.getByText(/all optional/i)).toBeInTheDocument();
  });

  it('caps APR at the ceiling the COLUMN imposes', () => {
    renderControl();
    expect(screen.getByLabelText(/APR/i)).toHaveAttribute('max', String(APR_MAX));
    expect(APR_MAX).toBe(999.99);   // Numeric(5,2)
  });

  it('reports each keystroke against its own field', async () => {
    const { onChange } = renderControl();
    await userEvent.type(screen.getByLabelText(/APR/i), '7');
    expect(onChange).toHaveBeenCalledWith('apr', '7');
  });

  it('shows the server\'s sentence under the field it names', () => {
    renderControl({ errors: { apr: 'Must be less than or equal to 999.99.' } });
    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('Must be less than or equal to 999.99.');
    // And the input is announced as invalid, not merely coloured.
    expect(screen.getByLabelText(/APR/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('uses the profile currency symbol, never a literal dollar (#126)', () => {
    renderControl({ currencySymbol: '£' });
    expect(screen.getByLabelText(/credit limit/i)).toHaveAttribute('placeholder', '£0.00');
  });

  it('disables every field while a save is in flight', () => {
    renderControl({ disabled: true });
    expect(screen.getByLabelText(/APR/i)).toBeDisabled();
    expect(screen.getByLabelText(/credit limit/i)).toBeDisabled();
    expect(screen.getByLabelText(/minimum payment/i)).toBeDisabled();
  });
});
