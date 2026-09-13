"""A Non-Monthly budget is a sinking fund, and its month is one twelfth.

*** THE PROBLEM: a £600 car tax in March always reads as an overspend against a
monthly view. *** Design §10 item 3 asked whether Non-Monthly needs a longer
period to mean anything, and noted Monarch shows `$0 planned / $278 actual` for
the same case — nobody has solved the monthly framing.

Owner decision 2026-09-13: the budget carries the ANNUAL amount and the page
shows the monthly set-aside.

*** WHICH MAKES THE APP AGREE WITH A LESSON IT ALREADY SHIPS. *** `sinking-funds`
is one of the nineteen seeded learnPal lessons: *"divide the yearly cost by
twelve and set that aside each month, so the bill is already paid when it
arrives."* Teaching one thing and computing another is worse than doing neither.

*** AND THE TEST THAT MATTERS MOST IS THE ONE ABOUT NOT TOUCHING EXISTING ROWS.
*** Nothing in the data distinguishes an annual figure from a monthly one, so
reinterpreting `amount` would be D-178's failure with real money attached.
`period='yearly'` is the carrier instead.
"""

import pytest

from src.services.budget.sinking import (
    describe,
    is_sinking_fund,
    monthly_set_aside,
)


class TestMonthlySetAside:
    def test_a_yearly_amount_is_divided_by_twelve(self):
        assert monthly_set_aside(600, 'yearly') == 50.0

    def test_the_lessons_own_example_comes_out_right(self):
        # `sinking-funds` says: "A 600 car-tax bill is 50 a month you barely
        # notice instead of 600 you did not have in March." If this ever stops
        # being true, the app and its own teaching have diverged.
        assert monthly_set_aside(600, 'yearly') == 50.0

    def test_a_monthly_amount_is_left_exactly_alone(self):
        # *** THE ONE THAT PROTECTS EXISTING DATA. *** Every Non-Monthly budget
        # already in a database was typed by somebody who believed the field
        # meant what the form said. Dividing it would change their figure under
        # them.
        assert monthly_set_aside(600, 'monthly') == 600.0

    def test_a_weekly_amount_is_left_alone_too(self):
        assert monthly_set_aside(600, 'weekly') == 600.0

    def test_a_missing_amount_is_None_and_not_zero(self):
        # "No target" and "a target of nothing" are different claims. A 0 the
        # user acts on is a lie — the same rule the group totals follow when
        # they refuse to clamp a negative remainder.
        assert monthly_set_aside(None, 'yearly') is None

    def test_rubbish_is_None_rather_than_an_exception(self):
        assert monthly_set_aside('not a number', 'yearly') is None

    def test_the_period_is_read_case_insensitively(self):
        assert monthly_set_aside(600, 'Yearly') == 50.0

    def test_it_rounds_to_the_penny(self):
        assert monthly_set_aside(1000, 'yearly') == 83.33


class TestIsSinkingFund:
    def test_both_conditions_are_required(self):
        # *** NOT "EITHER". *** A yearly budget on a FLEXIBLE category is still
        # a yearly budget, not a fund you draw down; a monthly Non-Monthly
        # budget is a user saying their figure is already per-month.
        assert is_sinking_fund('non_monthly', 'yearly') is True
        assert is_sinking_fund('non_monthly', 'monthly') is False
        assert is_sinking_fund('flexible', 'yearly') is False
        assert is_sinking_fund('fixed', 'yearly') is False

    def test_a_missing_period_is_not_a_sinking_fund(self):
        assert is_sinking_fund('non_monthly', None) is False


class TestDescribe:
    def test_it_says_what_to_put_by(self):
        assert describe(600, 'yearly') == 'set aside 50.00 a month'

    def test_it_thousands_separates_a_large_one(self):
        assert describe(24000, 'yearly') == 'set aside 2,000.00 a month'

    def test_a_monthly_budget_has_nothing_to_say(self):
        # `None`, not '' — so a caller renders nothing rather than an empty
        # element. Same shape as `check_reason` refusing to explain a predicate
        # it does not know.
        assert describe(600, 'monthly') is None

    def test_a_missing_amount_has_nothing_to_say(self):
        assert describe(None, 'yearly') is None
