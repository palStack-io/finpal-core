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

/** Is this a colour the user can only have got by picking it? */
const isADeliberateChoice = (currentColor: string | undefined, previousType: string) => {
  if (!currentColor) return false;
  // A legacy `var(--...)` value is not pickable from today's swatches — it predates #123
  // and re-posting it would fail the column. Treat it as unset so changing type heals it.
  if (!ACCOUNT_COLORS.some((c) => c.value === currentColor)) return false;
  // Still on the outgoing type's default means the user never touched the swatches.
  return currentColor !== getDefaultColorForType(previousType);
};

/**
 * The colour an account should have after its type changes.
 *
 * palStack-io/finpal-core#130: both forms did this unconditionally —
 *
 *     if (name === 'type') updates.color = getDefaultColorForType(value);
 *
 * — so every type change discarded a colour the user had deliberately picked, with no
 * way back except re-picking. The reporter described it as "always reset to Green", which
 * is a real defect imprecisely stated: it resets to the *incoming* type's default, and
 * green is savings' only. Green is neither the first swatch nor the fallback.
 *
 * The behaviour worth keeping is the other half — someone who never opens the swatches
 * should still get a sensible per-type colour. So the default follows the type only while
 * the colour is untouched, which is the distinction the old code never drew.
 *
 * A colour that happens to equal *another* type's default still counts as chosen: picking
 * purple while on `checking` is a choice even though purple is investment's default. Only
 * the OUTGOING type's own default reads as untouched.
 */
export const colorForTypeChange = ({
  previousType,
  nextType,
  currentColor,
}: {
  previousType: string;
  nextType: string;
  currentColor?: string;
}): string =>
  isADeliberateChoice(currentColor, previousType)
    ? (currentColor as string)
    : getDefaultColorForType(nextType);
