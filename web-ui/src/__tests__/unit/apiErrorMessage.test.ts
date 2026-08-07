/**
 * What a refused request tells the user — AUDIT D-53, web half.
 *
 * Every catch in web-ui read `err.response?.data?.error`. For anything
 * `validate_request` refuses that is the **constant string "Validation error"**;
 * the sentence the server wrote about the request is in `details`, and nothing
 * read it. Item C made four such refusals reachable in one go — a percentage over
 * 100, a custom share above the amount, splits that do not add up, a group you
 * are not in — and all four showed the same two words.
 *
 * The `err.message` clause is the D-44 rule stated precisely. axios always sets
 * `message` to "Request failed with status code 400", so letting it win shows a
 * status code where an explanation belongs — but `EditAccountForm` and
 * `TransactionRules` both `throw new Error(...)` locally, and those messages are
 * the only thing there is. Reading it *only when there is no response* keeps both.
 */
import { describe, it, expect } from 'vitest';
import { apiErrorMessage } from '../../utils/apiError';

const axiosLike = (data: unknown) => ({
  message: 'Request failed with status code 400',
  response: { data },
});

describe('apiErrorMessage', () => {
  it('prefers the specific reason in `details` over the generic `error`', () => {
    expect(
      apiErrorMessage(
        axiosLike({
          success: false,
          error: 'Validation error',
          details: { category_splits: ['The split amounts must add up to the transaction amount.'] },
        }),
        'Failed to create transaction',
      ),
    ).toBe('The split amounts must add up to the transaction amount.');
  });

  it('falls back to `error` when the body carries no details', () => {
    expect(
      apiErrorMessage(axiosLike({ error: 'Unknown group, or you are not a member of it.' }), 'nope'),
    ).toBe('Unknown group, or you are not a member of it.');
  });

  it('never lets axios’s own message beat the server’s reason', () => {
    // The D-44 defect, in one assertion.
    expect(apiErrorMessage(axiosLike({ error: 'Real reason' }), 'nope')).toBe('Real reason');
    expect(apiErrorMessage(axiosLike({}), 'the fallback')).toBe('the fallback');
    expect(apiErrorMessage(axiosLike(undefined), 'the fallback')).toBe('the fallback');
  });

  it('keeps a locally thrown message, which never went near the network', () => {
    // EditAccountForm.tsx and TransactionRules.tsx both do this before calling
    // the API. Dropping it would replace a real complaint with a generic one.
    expect(apiErrorMessage(new Error('Account name is required'), 'the fallback')).toBe(
      'Account name is required',
    );
  });

  it('reads a details value given as a bare string, not only as a list', () => {
    expect(
      apiErrorMessage(axiosLike({ error: 'Validation error', details: { amount: 'Must be positive.' } }), 'nope'),
    ).toBe('Must be positive.');
  });

  it('names every failing field, so the form does not argue one problem at a time', () => {
    const message = apiErrorMessage(
      axiosLike({
        error: 'Validation error',
        details: { split_value: ['A percentage cannot exceed 100.'], amount: ['Must be positive.'] },
      }),
      'nope',
    );

    expect(message).toContain('A percentage cannot exceed 100.');
    expect(message).toContain('Must be positive.');
  });

  it('falls back rather than throwing on shapes it has never seen', () => {
    for (const bad of [undefined, null, {}, { response: {} }, axiosLike({ details: {} }), axiosLike({ details: { f: [] } })]) {
      expect(apiErrorMessage(bad, 'the fallback')).toBe('the fallback');
    }
  });
});
