/**
 * Account colours — the single source of truth for both account forms.
 *
 * THESE ARE HEX ON PURPOSE, and this is the one place in web-ui where a hardcoded hex
 * is right rather than a CSS variable. The value is not a style: it is posted to
 * `POST /api/v1/accounts` and stored in `Account.color`, which is `db.String(7)` — "Hex
 * color code (e.g., #3b82f6)". A CSS variable reference is a *string* to the API.
 *
 * That is palStack-io/finpal-core#123. AddAccountForm and EditAccountForm each carried
 * their own copy of this list with `var(--accent-blue)`-style values in it, so:
 *
 *   - `var(--brand-green-glow)` (23 chars) tripped the marshmallow ceiling → 400 with
 *     nothing in the backend log, which is the failure the reporter attached.
 *   - `var(--accent-blue)` (18), `var(--accent-red)` (17) and `var(--accent-yellow)`
 *     (20) cleared the ceiling and then overran the 7-character column.
 *
 * Only `investment` worked, because its default was already a hex literal. Creating a
 * checking, savings, credit or cash account was impossible.
 *
 * The values match `SimpleFin.get_default_color_for_type` in
 * integrations/simplefin/client.py, which is what the backend falls back to when a
 * client sends no colour — so a manually created account and an imported one of the
 * same type now look the same. Keep the two in step.
 *
 * The list lived in two files and both were wrong in the same way; it lives here now so
 * there is nothing to drift.
 */

export interface AccountColor {
  value: string;
  label: string;
}

export const ACCOUNT_COLORS: AccountColor[] = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#22c55e', label: 'Green' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#f59e0b', label: 'Orange' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#eab308', label: 'Yellow' },
];

/** Mirrors integrations/simplefin/client.py's color_map. */
export const getDefaultColorForType = (type: string): string => {
  switch (type) {
    case 'checking': return '#3b82f6';
    case 'savings': return '#22c55e';
    case 'credit': return '#ef4444';
    case 'investment': return '#8b5cf6';
    case 'cash': return '#f59e0b';
    case 'loan': return '#ef4444';
    default: return '#3b82f6';
  }
};

/**
 * What `Account.color` can hold. Used by the guard test so the ceiling is asserted
 * against something, not restated.
 */
export const ACCOUNT_COLOR_MAX_LENGTH = 7;
