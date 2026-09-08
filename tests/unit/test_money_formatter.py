"""Unit tests for the server-side money formatter (stream A, item A2).

*** EVERY EXPECTED STRING HERE WAS MEASURED OUT OF `Intl.NumberFormat`, NOT
CHOSEN. *** The clients format money with `web-ui/src/styles/money.tsx`
(`formatMoneyParts`) and mobile does the same; this formatter exists so the
email agrees with them. A formatter asserted against its own output would prove
only that it is self-consistent, which is what D-145 already was five times
over — five copies of `formatCurrency` that disagreed five ways.

The reference values come from running the real thing under node (ICU 78.2):

    new Intl.NumberFormat(locale, {style: 'currency', currency,
        minimumFractionDigits: 2, maximumFractionDigits: 2})
        .formatToParts(Math.abs(value))

with the currency parts joined as the symbol, the literals dropped, and the
sign prefixed — which is exactly what `formatMoneyParts` does.

Two consequences of mirroring that, both deliberate:

  * The symbol is always PREFIXED, even in locales whose own convention puts it
    last (de-DE natively writes `1.234,56 €`). Dropping the `literal` parts and
    concatenating is what `money.tsx` does, so `€1.234,56` is what the app
    shows and what the email must show too. Do not "fix" this without changing
    both clients — a user seeing one form in the app and the other in their
    inbox is the drift D-145 exists to prevent.
  * Two fraction digits regardless of the currency's own convention, so JPY
    renders `.89`. `money.tsx` pins `minimumFractionDigits: 2`.
"""
from decimal import Decimal

import pytest

from src.utils.money import format_money

# Measured from node; \u escapes are the actual code points, asserted as such
# because U+202F (narrow no-break space) and U+00A0 are invisible in a diff.
BIG = Decimal('1234567.891')


def test_us_dollars_in_the_us_locale():
    assert format_money(BIG, 'USD', 'en-US') == '$1,234,567.89'


def test_the_default_locale_is_us_english_like_the_clients():
    # money.tsx's DEFAULT_LOCALE. A user with no preference is the common case.
    assert format_money(BIG, 'USD', None) == '$1,234,567.89'


def test_euros_in_germany_use_dots_for_grouping_and_a_comma_for_decimals():
    assert format_money(BIG, 'EUR', 'de-DE') == '€1.234.567,89'


def test_france_groups_with_a_narrow_no_break_space():
    # U+202F, not a plain space. A hand-written separator table gets this wrong.
    assert format_money(BIG, 'EUR', 'fr-FR') == '€1 234 567,89'


def test_india_groups_in_lakhs_not_in_thousands():
    # 12,34,567.89 — the case that rules out a hand-rolled formatter entirely.
    assert format_money(BIG, 'INR', 'en-IN') == '₹12,34,567.89'


def test_brazil_keeps_the_two_character_symbol_and_its_own_separators():
    assert format_money(BIG, 'BRL', 'pt-BR') == 'R$1.234.567,89'


def test_yen_still_shows_minor_units_because_the_clients_pin_two_digits():
    # Babel would default to the currency's own 0 digits here; Intl does not,
    # because money.tsx sets minimumFractionDigits: 2.
    assert format_money(BIG, 'JPY', 'ja-JP') == '￥1,234,567.89'


def test_the_currency_and_the_locale_are_independent():
    # A German-formatting user holding US dollars: US symbol, German separators.
    assert format_money(BIG, 'USD', 'de-DE') == '$1.234.567,89'


def test_a_negative_uses_the_minus_sign_not_a_hyphen():
    # U+2212. money.tsx: "the same width as a digit in a tabular font, so a
    # negative row still aligns with the positives above it."
    assert format_money(Decimal('-45.50'), 'USD', 'en-US') == '−$45.50'


def test_a_negative_keeps_the_locale_separators():
    assert format_money(Decimal('-45.50'), 'EUR', 'de-DE') == '−€45,50'


def test_zero_renders_as_zero_with_minor_units():
    assert format_money(Decimal('0'), 'USD', 'en-US') == '$0.00'


def test_signed_adds_a_plus_to_a_positive():
    assert format_money(Decimal('45.50'), 'USD', 'en-US', signed=True) == '+$45.50'


def test_signed_does_not_add_a_plus_to_zero():
    assert format_money(Decimal('0'), 'USD', 'en-US', signed=True) == '$0.00'


def test_signed_leaves_a_negative_with_its_minus():
    assert format_money(Decimal('-45.50'), 'USD', 'en-US', signed=True) == '−$45.50'


def test_whole_units_drops_the_decimals_and_rounds():
    # money.tsx's `round`: "For summary figures, never for a ledger row."
    assert format_money(BIG, 'USD', 'en-US', whole_units=True) == '$1,234,568'
    assert format_money(BIG, 'EUR', 'de-DE', whole_units=True) == '€1.234.568'


# --- rounding -------------------------------------------------------------

def test_a_half_cent_rounds_away_from_zero():
    # Intl's default roundingMode is halfExpand, so 0.125 -> 0.13. Asserted
    # because delegating the mode silently would let Python's default
    # ROUND_HALF_EVEN give 0.12 and disagree with every screen.
    assert format_money(Decimal('0.125'), 'USD', 'en-US') == '$0.13'
    assert format_money(Decimal('-0.125'), 'USD', 'en-US') == '−$0.13'


def test_a_float_amount_rounds_the_way_a_person_reads_it():
    """Analytics returns floats, so this is the live path, not a curiosity.

    *** WHAT THIS DOES AND DOES NOT GUARD, BECAUSE I TRIED TO SABOTAGE IT AND
    COULD NOT. *** The claim I first wrote here was that it catches an
    implementation building the Decimal straight from the float —
    `Decimal(8.485)` is 8.48499999999999943157..., which rounds DOWN. It does
    not catch that, and no test at this magnitude could: `_as_decimal`
    quantises to PRECISE (8 places) and a double's error for a value of this
    size lives around the 16th, so both routes agree by the time rounding
    matters. Two sabotages passed before this comment was written, and a
    sabotage that passes is a hole in the test rather than a bad sabotage.

    What it does guard is the rounding DIRECTION at the displayed precision:
    8.485 must read as $8.49, not $8.48. `ROUND_HALF_EVEN` — Python's default,
    and the one this file would get by delegating — fails it.
    """
    assert format_money(8.485, 'USD', 'en-US') == '$8.49'


def test_a_half_cent_on_an_exact_decimal_rounds_up():
    assert format_money(Decimal('8.485'), 'USD', 'en-US') == '$8.49'


# --- refusals -------------------------------------------------------------

def test_none_is_refused_rather_than_shown_as_zero():
    # A missing figure rendered as $0.00 is D-108's shape: a measured-looking
    # zero. Deciding that an absent value is an empty state is the builder's
    # job, and it cannot make that decision if the formatter swallows None.
    with pytest.raises(TypeError):
        format_money(None, 'USD', 'en-US')


def test_a_locale_babel_does_not_know_falls_back_to_the_default_and_says_so(caplog):
    # The column is validated for SHAPE only (src/utils/locale.py is
    # deliberately not a whitelist), so a well-formed tag nobody supports will
    # arrive. The clients fall back the same way: money.tsx wraps
    # `new Intl.NumberFormat(locale)` in a try and reverts to en-US.
    with caplog.at_level('WARNING'):
        result = format_money(BIG, 'USD', 'zz-ZZ')

    assert result == '$1,234,567.89'
    assert 'zz-ZZ' in caplog.text


def test_an_unknown_currency_is_refused_rather_than_guessed():
    # Not a fallback: showing dollars for a currency we cannot name would put a
    # wrong unit on a real figure.
    with pytest.raises(ValueError):
        format_money(BIG, 'XYZ_NOT_A_CURRENCY', 'en-US')


# --- the one measured disagreement ---------------------------------------

def test_swiss_german_grouping_differs_from_the_clients_by_one_glyph():
    """*** THIS IS THE ONE CASE WHERE SERVER AND CLIENT DO NOT AGREE. ***

    Babel's bundled CLDR gives `de-CH` the group separator U+2019 RIGHT SINGLE
    QUOTATION MARK; node on ICU 78.2 — which is what the browser uses — gives
    U+0027 APOSTROPHE. Both were measured, neither is a defect in finPal: it is
    two vintages of the same CLDR data, and de-CH is the only locale of the ten
    measured where they part.

    Asserted as what this code actually emits, with the client's value written
    out beside it, so the divergence is a recorded fact rather than a surprise
    for whoever next diffs an email against a screen. The fix, if a Swiss user
    ever cares, is to align the two data versions — not to patch the string.
    """
    ours = format_money(BIG, 'CHF', 'de-CH')

    assert ours == 'CHF1’234’567.89'
    assert ours != "CHF1'234'567.89"  # what money.tsx renders
    # Everything except that one character agrees, which is the point.
    assert ours.replace('’', "'") == "CHF1'234'567.89"
