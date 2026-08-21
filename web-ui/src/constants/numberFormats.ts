/**
 * Number-format choices offered to the user (#132).
 *
 * Reported as `palStack-io/finpal-core#132`: *"in Europe we prefer the use of ',' (comma)
 * for numbers and not '.' (dot)"*.
 *
 * A short curated list rather than every BCP-47 tag, matching how currency and timezone
 * are already offered in onboarding and settings. What the user is really choosing is a
 * separator convention, so each option is LABELLED WITH AN EXAMPLE — "1.234,56" tells
 * someone what they are picking; "de-DE" does not.
 *
 * The stored value is a real locale tag, so `Intl` does the formatting and nothing here
 * has to reimplement separator rules. `null` means the app default (en-US), which is what
 * every existing account has — `User.number_locale` is nullable with no default so that
 * deploying this does not re-shape anyone's figures uninvited.
 */
export interface NumberFormatOption {
  /** BCP-47 tag stored in `User.number_locale`. `null` = app default. */
  value: string | null;
  /** What the user sees: the convention, shown by example. */
  label: string;
  /** Where it is the norm, to help someone recognise their own. */
  hint: string;
}

export const NUMBER_FORMATS: NumberFormatOption[] = [
  { value: null,    label: '1,234.56', hint: 'Dot decimal — UK, US, Ireland, Australia' },
  { value: 'de-DE', label: '1.234,56', hint: 'Comma decimal — Germany, Spain, Italy, Netherlands' },
  { value: 'fr-FR', label: '1 234,56', hint: 'Comma decimal, space grouping — France' },
  { value: 'de-CH', label: "1'234.56", hint: 'Dot decimal, apostrophe grouping — Switzerland' },
];

/** The option matching a stored value, falling back to the default. */
export const numberFormatFor = (locale: string | null | undefined): NumberFormatOption =>
  NUMBER_FORMATS.find((f) => f.value === (locale ?? null)) ?? NUMBER_FORMATS[0];
