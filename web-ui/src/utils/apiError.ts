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
