/**
 * The sentence to show a user when a request is refused.
 *
 * finPal's API answers a validation failure like this:
 *
 *   {"success": false, "error": "Validation error",
 *    "details": {"split_value": ["A percentage cannot exceed 100."]}}
 *
 * Three layers, and until D-53 every caller read the middle one. **`error` is the
 * constant string "Validation error"** for anything `validate_request` refuses —
 * it names a category of problem, not the problem. The sentence the server wrote
 * *about this request* is in `details`, and **no client anywhere read it**: a
 * percentage over 100, a custom share above the amount, splits that do not add
 * up, a group you are not in and an amount change on a split transaction all
 * arrived as the same two useless words.
 *
 * **`err.message` is read only when there is no HTTP response at all.** That is
 * the D-44 rule stated precisely rather than as "never touch it": axios always
 * populates `message` with "Request failed with status code 400", so letting it
 * win over the server's reason shows a user a status code — but a locally thrown
 * `new Error('Account name is required')` never reaches the network and its
 * message is the only thing there is. Checking for `response` distinguishes them.
 *
 * The mobile app carries the same function at `mobile/src/utils/apiError.ts`.
 * Keep the two in step; they read the same API.
 */
type ErrorDetails = Record<string, unknown>;

const sentencesIn = (details: ErrorDetails): string[] =>
  Object.values(details).flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    return [];
  });

export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const err = error as
    | { message?: unknown; response?: { data?: unknown } }
    | undefined
    | null;
  const data = err?.response?.data;

  if (data && typeof data === 'object') {
    const body = data as { error?: unknown; details?: unknown };

    if (body.details && typeof body.details === 'object') {
      // Every failing field, not just the first. Being told about one problem at
      // a time is what makes a form feel like it is arguing back.
      const sentences = sentencesIn(body.details as ErrorDetails);
      if (sentences.length) return sentences.join(' ');
    }

    if (typeof body.error === 'string' && body.error) return body.error;
  }

  // No response — a local `throw new Error(...)`, or the network never answered.
  if (!err?.response && typeof err?.message === 'string' && err.message) return err.message;

  return fallback;
};

/**
 * The same `details` bag, kept KEYED instead of flattened into a sentence.
 *
 * *** THIS LIVES HERE BECAUSE `apiErrorPrecedence.test.ts` REQUIRES IT TO. ***
 * That guard says exactly one file may read `response.data.(error|details|message)`,
 * and it is this one -- D-53 was not one file reading the wrong key, it was every
 * file reading `data.error` and showing the user the constant string "Validation
 * error". A form that wanted per-field messages and reached into the body itself
 * would be that defect coming back one site at a time, so the extraction is here
 * and the caller gets a plain object.
 *
 * `apiErrorMessage` above answers "what one sentence do I show?". This answers
 * "which FIELD was refused?", which is what a form with three numeric inputs on it
 * needs -- a single toast saying "must be less than or equal to 999.99" does not
 * say which of APR, credit limit and minimum payment it means.
 *
 * Keys are the server's own -- snake_case column names. Mapping them to a form's
 * field names is the form's business, not this file's.
 */
export const apiFieldErrors = (error: unknown): Record<string, string> => {
  const err = error as { response?: { data?: unknown } } | undefined | null;
  const data = err?.response?.data;
  if (!data || typeof data !== 'object') return {};

  const details = (data as { details?: unknown }).details;
  if (!details || typeof details !== 'object') return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    // marshmallow sends a LIST of messages per field; a hand-written 400 may send
    // a bare string. Take the first sentence either way -- a field can only show
    // one line under it.
    if (Array.isArray(value)) {
      const first = value.find((item): item is string => typeof item === 'string');
      if (first) out[key] = first;
    } else if (typeof value === 'string' && value) {
      out[key] = value;
    }
  }
  return out;
};
