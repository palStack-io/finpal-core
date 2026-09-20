/**
 * The four goals a person actually sets, and the three the server stores.
 *
 * *** THE CREATE FORM NEVER EXPOSED `kind` AT ALL — IT DEFAULTED TO
 * `savings`. *** So every goal anybody has made through the UI is a savings
 * goal as far as the payload is concerned, including the ones paying a card
 * off. The arithmetic survived that because `direction` is DERIVED from the
 * amounts (see `Goal.kind`'s own comment), which is exactly why nobody
 * noticed.
 *
 * *** FOUR CHOICES, THREE STORED VALUES, AND THE COLLAPSE IS DELIBERATE. ***
 * `GOAL_KINDS` on the server is `['payoff', 'savings', 'custom']`, validated
 * with `OneOf`. An emergency fund and a sinking fund are both `savings`, so
 * AFTER CREATION finPal cannot tell them apart. That is a real limitation and
 * it is the cheap one: the difference only decides which calculator helps you
 * pick a target, and nothing downstream acts on it. Adding two enum values
 * would mean a server change plus every reader of `kind` learning them, to
 * preserve a distinction no code consults.
 *
 * *** BYTE-IDENTICAL IN `web-ui/src/utils/` AND `mobile/src/utils/`. *** Two
 * clients offering different goal kinds is D-101 in a dropdown. A test diffs
 * the files; `peakCopy.ts` and `badgeGlyph.ts` are kept the same way.
 */

/** What the user picks. NOT what goes on the wire. */
export type GoalKindChoice = 'payoff' | 'buffer' | 'sinking' | 'other';

/** What the server stores. `schemas/input_schemas.py: GOAL_KINDS`. */
export type StoredGoalKind = 'payoff' | 'savings' | 'custom';

export interface GoalKindOption {
  value: GoalKindChoice;
  label: string;
  /** One line under the picker saying what choosing this will do. */
  hint: string;
  stored: StoredGoalKind;
}

export const GOAL_KIND_OPTIONS: GoalKindOption[] = [
  {
    value: 'payoff',
    label: 'Debt paydown',
    hint: 'Clearing a card or a loan. finPal will show what it costs you and '
        + 'how long it takes.',
    stored: 'payoff',
  },
  {
    value: 'buffer',
    label: 'Emergency fund',
    hint: 'Money for the month something goes wrong. finPal works out what '
        + 'three or six months of your essentials would cost.',
    stored: 'savings',
  },
  {
    value: 'sinking',
    label: 'Bills that are not monthly',
    hint: 'Car tax, renewals, presents in December. finPal adds up last '
        + 'year’s and divides by twelve.',
    stored: 'savings',
  },
  {
    value: 'other',
    label: 'Something else',
    hint: 'Name it and set a target yourself.',
    stored: 'custom',
  },
];

/** `GoalKindChoice` -> the value the API accepts. */
export const storedKind = (choice: GoalKindChoice): StoredGoalKind =>
  GOAL_KIND_OPTIONS.find((o) => o.value === choice)?.stored ?? 'custom';

/**
 * A suggestion's `kind` -> the choice to preselect.
 *
 * *** `suggest.py` SENDS THE STORED KIND, WHICH IS LOSSY IN EXACTLY ONE
 * PLACE. *** Both savings suggestions arrive as `'savings'`, so the CHECK
 * name is what distinguishes them — `has_non_monthly_spending` is the sinking
 * fund and everything else savings-shaped is the buffer. Keyed on the check
 * rather than on the headline, because a headline is copy somebody will
 * reword and a check name is an identifier.
 */
export const choiceForSuggestion = (
  kind: string, check: string,
): GoalKindChoice => {
  if (kind === 'payoff') return 'payoff';
  if (check === 'has_non_monthly_spending') return 'sinking';
  return 'buffer';
};
