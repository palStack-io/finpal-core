/**
 * Remove sensitive values from a tool result.
 *
 * Defence in depth, NOT the security boundary — that is the token's read scope,
 * enforced by finpal_core. A malicious client can call the REST API directly.
 *
 * What is scrubbed comes from an audit of the real response surface, not from
 * guesswork. The original design targeted account numbers and SimpleFin access
 * tokens; neither is reachable, and `account_number` is not even a column. What
 * does reach a model:
 *
 *   - `name` and `card_used` carry the last four digits, because SimpleFin
 *     writes the bank's label verbatim. These are SCRUBBED, not dropped: the
 *     label is what makes an answer readable.
 *   - `notes` is free text and users put account numbers in it. Dropped.
 *   - `user_id` IS an email address — the User primary key is the address — and
 *     split resolution returns other household members'. Pseudonymised.
 */

export interface ScrubContext {
  ownerId: string;
}

/** Four or more consecutive digits. */
const DIGIT_RUN = /\d{4,}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * A value that is *entirely* an ISO-8601 date, month or timestamp.
 *
 * Every such value contains a four-digit year, so blanket digit-masking turns
 * `2026-03-01` into `••••-03-01` and every date-bearing answer becomes useless.
 * The exemption is on the value's SHAPE, not on the key's name: a key allowlist
 * would let `date: "card 4242"` through, whereas nothing shaped like a timestamp
 * can be an account number. `Renewal 2026` is not exempt — it is not anchored, and
 * month and day are range-checked so `4242-42` is not read as a month.
 *
 * Matches `2026-03` (the key the spending summary groups months by), `2026-03-01`,
 * and `2026-03-01T09:15:00[.123456][+00:00|Z]` — marshmallow's DateTime output.
 */
const ISO_TEMPORAL =
  /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01])([T ]([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;

/** Dropped wholesale: free text, or anything key-shaped like a credential. */
const DROP_KEYS = new Set(['notes', 'note']);
const CREDENTIAL_KEY = /(token|secret|password|api_key|apikey|access_url|credential)/i;

/** Values that are labels needing digit-masking rather than removal. */
const LABEL_KEYS = new Set(['name', 'card_used', 'institution', 'description']);

/** Values that are identities needing pseudonymising. */
const IDENTITY_KEYS = new Set(['user_id', 'paid_by', 'email', 'id_email', 'owner']);

export function scrubDigits(text: string): string {
  return text.replace(DIGIT_RUN, '••••');
}

const assigned = new Map<string, string>();

export function pseudonym(email: string, ctx: ScrubContext): string {
  if (email === ctx.ownerId) return 'you';
  let existing = assigned.get(email);
  if (!existing) {
    existing = `member-${assigned.size + 1}`;
    assigned.set(email, existing);
  }
  return existing;
}

/** True when the whole string is a date, a month bucket or a timestamp. */
export function isTemporal(value: string): boolean {
  return ISO_TEMPORAL.test(value);
}

function scrubString(value: string, ctx: ScrubContext): string {
  const people = value.replace(EMAIL, (m) => pseudonym(m, ctx));
  if (isTemporal(people)) return people;
  return scrubDigits(people);
}

export function scrub(value: unknown, ctx: ScrubContext): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, ctx));
  if (typeof value === 'string') return scrubString(value, ctx);
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (DROP_KEYS.has(lower) || CREDENTIAL_KEY.test(lower)) continue;

    if (typeof raw === 'string') {
      if (IDENTITY_KEYS.has(lower)) {
        out[key] = raw.includes('@') ? pseudonym(raw, ctx) : scrubString(raw, ctx);
        continue;
      }
      if (LABEL_KEYS.has(lower)) {
        out[key] = scrubString(raw, ctx);
        continue;
      }
      out[key] = scrubString(raw, ctx);
      continue;
    }
    out[key] = scrub(raw, ctx);
  }
  return out;
}
