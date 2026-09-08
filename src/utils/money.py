"""Money: reading it in from outside, and rendering it for a person.

Two halves, deliberately in one module because they are the same subject and
splitting them is how a codebase ends up with five formatters. `to_money` /
`money_or_zero` coerce inbound values (D-58); `format_money` renders outbound
ones (D-145). Both round ROUND_HALF_UP, and for the same stated reason.

── INBOUND ─────────────────────────────────────────────────────────────────────

**AUDIT D-58.** Money columns are `Numeric` — exact decimal — because
`Account.balance` is mutated in place and nothing ever re-derives it from the
transactions that produced it, so a binary-float error accumulates and never
self-corrects. Observed on the deploy: 1104.55 became 1104.5500000000002 after a
single add-and-delete.

The columns being `Numeric` is only half of it. A value read back from the
database is a `Decimal`, but a value that has just arrived from a JSON payload is
a `float`, and in Python **`Decimal + float` raises `TypeError`** rather than
quietly converting. So there has to be exactly one place where the outside world's
numbers become money, and this is it.

Coercing through `str()` is deliberate and is the whole point: `Decimal(0.1)` is
0.1000000000000000055511151231257827021181583404541015625 — the binary float's
true value, faithfully preserved — whereas `Decimal(str(0.1))` is `0.1`. Going via
the repr is what discards the error that floating point already introduced,
instead of carrying it into a type that will then hold onto it forever.
"""
import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from babel import Locale, UnknownLocaleError
from babel.numbers import (
    format_currency, get_currency_symbol, list_currencies,
)

logger = logging.getLogger(__name__)

#: Currency amounts. Two places, matching `Numeric(18, 2)` in the models.
CENTS = Decimal('0.01')

#: Share counts and exchange rates, which legitimately need more than two places.
PRECISE = Decimal('0.00000001')


def to_money(value, quantum=CENTS):
    """A `Decimal` rounded to `quantum`, or `None` if there is no value.

    `None` passes through rather than becoming zero: `Expense.original_amount`
    and `TransactionRule.amount_min` are nullable, and "not set" is not "0.00".

    `ROUND_HALF_UP` rather than Python's default banker's rounding, because this
    is money a person reads: 0.125 becoming 0.12 is correct for statistics and
    surprising on a receipt.
    """
    if value is None or value == '':
        return None
    if isinstance(value, Decimal):
        return value.quantize(quantum, rounding=ROUND_HALF_UP)
    try:
        return Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None


def money_or_zero(value, quantum=CENTS):
    """`to_money`, with `None` collapsed to zero.

    For arithmetic that must produce a number — a balance move, a running total —
    where an absent amount means "moves nothing" rather than "unknown".
    """
    return to_money(value, quantum) or Decimal('0')


# ── OUTBOUND ──────────────────────────────────────────────────────────────────
#
# *** THIS HALF IS A MIRROR OF `web-ui/src/styles/money.tsx`, NOT AN
# INDEPENDENT IMPLEMENTATION. *** Both clients render money through
# `formatMoneyParts` there, which asks `Intl.NumberFormat` for the parts and
# joins them in a fixed order. Anything the server sends a person — the report
# email is the first — has to read the same way, so this reproduces that
# function's decisions rather than CLDR's defaults where the two differ.
#
# D-145 is why. `formatCurrency` was defined five times in web-ui and the
# copies disagreed: one used the user's own currency with zero decimals while
# the others hardcoded USD with two, so a user set to EUR saw a different unit
# and a different precision depending on the page. The Python path still has
# that defect latent — `email_service.py:697` formats with `f'${x:,.2f}'`, a
# hardcoded dollar sign and hardcoded US grouping — and it has only never been
# seen because the template it lives in is unreachable (D-149). New senders
# use this.
#
# Three places this departs from CLDR, all to match the clients:
#
#   1. The symbol is PREFIXED, always. `money.tsx` drops `Intl`'s `literal`
#      parts and concatenates symbol then digits, so a German user sees
#      `€1.234,56` rather than the native `1.234,56 €`. Changing it here alone
#      would put one form on the screen and the other in the inbox.
#   2. Two fraction digits regardless of the currency, because `money.tsx`
#      pins `minimumFractionDigits: 2`. So JPY shows minor units.
#   3. The sign is prefixed to the absolute value — U+2212 MINUS SIGN, not a
#      hyphen and not the locale's negative pattern (some use parentheses).
#      It is digit-width in a tabular font, which is what keeps a column of
#      figures aligned.
#
# Babel rather than a separator table, because the conventions are not
# guessable: `en-IN` groups in lakhs (`12,34,567.89`) and `fr-FR` groups with
# U+202F NARROW NO-BREAK SPACE. Both are CLDR facts, and both were measured
# out of node before this code existed.


# money.tsx's DEFAULT_LOCALE. A user with no `number_locale` gets this, and so
# does a user whose tag we cannot use — the client falls back identically.
DEFAULT_LOCALE = 'en-US'

MINUS_SIGN = '−'


def _resolve_locale(number_locale):
    """A Babel locale from a `User.number_locale` tag, or the default.

    `src/utils/locale.py` validates the column for BCP-47 SHAPE and
    deliberately not against a whitelist, so a well-formed tag that no CLDR
    data exists for is a value that can genuinely be in the database. It must
    not raise on a report run: it falls back, and says which tag it dropped,
    because a silently substituted locale is a silently wrong number.
    """
    if not number_locale:
        return Locale.parse(DEFAULT_LOCALE, sep='-')
    try:
        return Locale.parse(number_locale, sep='-')
    except (UnknownLocaleError, ValueError, TypeError):
        logger.warning(
            'No number formatting data for locale %r; falling back to %s',
            number_locale, DEFAULT_LOCALE)
        return Locale.parse(DEFAULT_LOCALE, sep='-')


def _as_decimal(amount):
    """An exact Decimal, refusing None.

    The coercion itself is `to_money`'s, above — one rule for turning an
    outside number into money, not a second one written here. Only the
    treatment of absence differs, and it differs deliberately:

    *** None MUST NOT BECOME ZERO. *** A missing figure rendered as `$0.00`
    reads as a measured zero, which is D-108's shape — Analytics gated its
    health cards on range-scoped totals and told a user with $9,000 of income
    to add some. Whether an absent value is an empty state is the caller's
    decision, and it cannot make it if this swallows the None.

    Quantised to PRECISE rather than CENTS so the rounding happens once, in
    `format_money`, at the number of digits actually being displayed.
    """
    if amount is None:
        raise TypeError(
            'format_money got None. An absent figure is the caller\'s to '
            'handle; rendering it as zero would claim a measurement.')
    exact = to_money(amount, PRECISE)
    if exact is None:
        raise TypeError(f'format_money cannot read an amount of type '
                        f'{type(amount).__name__}: {amount!r}')
    return exact


def format_money(amount, currency_code, number_locale=None, *,
                 signed=False, whole_units=False):
    """`amount` in `currency_code`, formatted the way the clients format it.

    amount         Decimal (preferred — exact), int or float. None is refused.
    currency_code  ISO 4217, e.g. the user's `default_currency_code`. An
                   unknown code raises rather than falling back: a wrong unit
                   on a real figure is worse than an error.
    number_locale  a BCP-47 tag from `User.number_locale`, or None.
    signed         show a leading + on a positive. Off by default.
    whole_units    drop the minor units. For summary figures, never for a
                   ledger row — `money.tsx` calls this `round`.
    """
    if currency_code not in list_currencies():
        raise ValueError(f'Unknown currency code: {currency_code!r}')

    value = _as_decimal(amount)
    locale = _resolve_locale(number_locale)
    digits = 0 if whole_units else 2

    # ROUND_HALF_UP on an absolute value is `Intl`'s halfExpand default. Pinned
    # rather than delegated: Python's own default is ROUND_HALF_EVEN, which
    # would render 0.125 as 0.12 and disagree with every screen in the app.
    quantum = Decimal(1).scaleb(-digits)
    magnitude = abs(value).quantize(quantum, rounding=ROUND_HALF_UP)

    # The locale's own currency pattern carries its grouping — `en-IN`'s is
    # `¤#,##,##0.00` — so the fraction digits are edited out of that pattern
    # rather than replaced by a generic one, which would group India in
    # thousands. `currency_digits=False` makes the pattern win over the
    # currency's own digit count, which is what pins JPY at two.
    pattern = locale.currency_formats['standard'].pattern
    if whole_units:
        pattern = pattern.replace('.00', '')

    rendered = format_currency(
        magnitude, currency_code, format=pattern, locale=locale,
        currency_digits=False, decimal_quantization=False)

    # `Intl.formatToParts` gets filtered down to the currency parts and the
    # number parts in money.tsx, dropping the `literal` parts — the space
    # between symbol and digits in most locales. Removing the symbol and
    # stripping the ends does the same thing: U+00A0 and U+202F are whitespace
    # to `strip()`, and only the ends are touched, so `fr-FR`'s U+202F GROUP
    # separators inside the number survive.
    symbol = get_currency_symbol(currency_code, locale=locale)
    digits_only = rendered.replace(symbol, '', 1).strip()

    sign = ''
    if value < 0:
        sign = MINUS_SIGN
    elif signed and value > 0:
        sign = '+'

    return f'{sign}{symbol}{digits_only}'
