/**
 * The user's own currency, for anything that renders a figure.
 *
 * *** THIS EXISTS BECAUSE THE ALTERNATIVE WAS EIGHT COPIES. *** Fixing the
 * hardcoded `$` sites needed the same three lines in six files —
 * `useAuthStore` → `default_currency_code` → `formatMoney` — and six copies of
 * a currency decision is how `formatCurrency` came to be defined five times
 * with the copies disagreeing about both the unit and the number of decimals
 * (D-145). One hook, one decision.
 *
 * *** A FIGURE'S OWN CURRENCY BEATS THE PROFILE DEFAULT. *** Some rows are
 * genuinely denominated in something else — a London-listed stock quote carries
 * `currency_code: 'GBP'`, a saved recurring row carries its own, and forcing
 * the profile's unit onto them would state a conversion that never happened.
 * So `money(amount, theRowsCurrency)` prefers the row and falls back to the
 * profile.
 *
 * *** IT DOES NOT CONVERT AND MUST NOT BE MADE TO. *** Changing a symbol
 * without an exchange rate turns a correct figure into a false claim, which is
 * the same defect shape as rendering an inferred account type as a fact
 * (D-77 / D-108). pointsPal's `*_usd` point valuations therefore keep their
 * dollar and are allowlisted in `noLiteralCurrencyInJsx.test.ts`.
 */
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../styles/money';

export function useMoney() {
  const user = useAuthStore((state) => state.user);
  const userCurrency = user?.default_currency_code || 'USD';

  /** `amount` in `currencyCode` if the row names one, else the user's own. */
  const money = (amount: number, currencyCode?: string | null): string =>
    formatMoney(amount, { currency: currencyCode || userCurrency });

  return { money, userCurrency };
}
