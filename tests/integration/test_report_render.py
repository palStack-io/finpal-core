"""The report's HTML, rendered from the builder's REAL payload (A5).

*** THE FIXTURE IS `build_report`'s OWN OUTPUT AND THAT IS THE POINT OF THIS
FILE. *** A hand-written fixture here is explicitly not acceptable, because
D-107 was exactly that: a capture fixture sent three keys the API never sends,
the page rendered `$NaN` eight times, and both gates called it clean — NaN text
has a contrast ratio and a NaN does not overflow. With the renderer pure and
fed the builder, a key the builder stops producing fails a test instead of
arriving in somebody's inbox.

Colour and contrast are NOT asserted here; that is A6's job, in
`tests/unit/test_email_templates_are_on_brand.py`, which measures rather than
greps.
"""
from datetime import date, datetime
from decimal import Decimal
import re

import pytest

from src.extensions import db as _db
from src.models.group import Settlement
from src.services.report.builder import build_report
from src.services.report.period import Period
from src.services.report.render import render_html
from tests.factories import (
    AccountFactory, CategoryFactory, ExpenseFactory, UserFactory)

WEEK = Period(start=date(2026, 8, 31), end=date(2026, 9, 6),
              label='Week of Aug 31 – Sep 6, 2026')
MONTH = Period(start=date(2026, 8, 1), end=date(2026, 8, 31), label='August 2026')
INSIDE = datetime(2026, 9, 2, 12, 0)
AUGUST_DAY = datetime(2026, 8, 15, 12, 0)


def _household(**user_kwargs):
    """A user with spending, income, two accounts and a housemate who owes them."""
    me = UserFactory(name='Harun', **user_kwargs)
    them = UserFactory(name='Rachel')
    current = AccountFactory(user_id=me.id, name='Current', type='checking',
                             balance=Decimal('2450.00'))
    AccountFactory(user_id=me.id, name='Amex', type='credit',
                   balance=Decimal('-450.00'))
    food = CategoryFactory(name='Groceries', user_id=me.id)
    travel = CategoryFactory(name='Travel', user_id=me.id)

    ExpenseFactory(user_id=me.id, account_id=current.id, amount=Decimal('75.00'),
                   date=INSIDE, paid_by=me.id, category_id=food.id)
    ExpenseFactory(user_id=me.id, account_id=current.id, amount=Decimal('25.00'),
                   date=INSIDE, paid_by=me.id, category_id=travel.id)
    ExpenseFactory(user_id=me.id, account_id=current.id, amount=Decimal('3000.00'),
                   date=INSIDE, paid_by=me.id, transaction_type='income')
    ExpenseFactory(user_id=me.id, account_id=current.id, amount=Decimal('100.00'),
                   date=INSIDE, paid_by=me.id, split_method='equal',
                   split_with=them.id, category_id=food.id)
    return me, them


@pytest.fixture
def html(db):
    me, _ = _household()
    return render_html(build_report(me.id, WEEK, 'weekly'))


# --- the figures reach the page -------------------------------------------

def test_the_period_label_is_the_heading(html):
    assert 'Week of Aug 31 – Sep 6, 2026' in html


def test_both_household_members_are_named(html):
    assert 'Harun' in html and 'Rachel' in html


def test_the_spend_total_is_rendered_as_money(html):
    """75 + 25 + the WHOLE 100 of the split shop, not the payer's half.

    Checked against the builder rather than assumed — the first draft of this
    test expected 150 and was wrong. Attribution is the account's owner (D-18,
    owner decision 2026-08-06), so a household transaction counts once, in
    full, against whoever owns the account it was paid from. Splitting a bill
    is how the household settles up; it is not a claim about whose money it
    was. The reader's share of it appears in "Settling up", not here.
    """
    assert '$200.00' in html


def test_each_category_and_its_amount_appear(html):
    assert 'Groceries' in html and 'Travel' in html
    assert '$175.00' in html    # 75 groceries + the full 100 split shop
    assert '$25.00' in html


def test_the_income_figure_is_rendered(html):
    assert '$3,000.00' in html


def test_the_card_debt_is_rendered_as_money_owed(html):
    """Stored as -450.00; a person is owed a positive number."""
    assert '$450.00' in html


def test_the_accounts_are_named_with_their_balances(html):
    assert 'Current' in html and 'Amex' in html
    assert '$2,450.00' in html


def test_the_repayment_tracker_names_both_people(html):
    assert 'Rachel' in html
    assert '$50.00' in html


# --- the D-107 guard ------------------------------------------------------

def test_no_placeholder_or_broken_figure_reaches_the_html(html):
    """The guard this whole file exists for.

    `$NaN`, `None` and `undefined` are what a missing key renders as, and all
    three are invisible to a contrast gate and to an overflow gate.
    """
    for poison in ('NaN', 'nan', 'None', 'undefined', 'null', '{', '}'):
        assert poison not in html, f'{poison!r} rendered into the email'


def test_no_cell_where_a_figure_belongs_is_empty(html):
    """An empty `<td>` is how a dropped value looks when nothing crashes."""
    empties = re.findall(r'<td[^>]*>\s*</td>', html)
    assert empties == [], f'{len(empties)} empty cells: {empties[:3]}'


def test_the_html_is_a_whole_document_that_declares_its_own_surface(html):
    """D-129: `send_import_review_email` is a bare fragment with no background
    of its own, and a file-wide colour sweep took its text to 2.24:1 while
    improving every other template. This one paints its own surface, so its
    contrast is a property of the template rather than of the mail client."""
    assert html.lstrip().startswith('<!DOCTYPE html>')
    assert '<body' in html
    assert '#0E1711' in html


def test_no_css_variable_survives_into_the_email(html):
    """An email client resolves no `var()`; it renders unstyled."""
    assert 'var(--' not in html


# --- locale ---------------------------------------------------------------

def test_money_follows_the_users_locale_and_currency(db):
    me, _ = _household(default_currency_code='EUR', number_locale='de-DE')

    html = render_html(build_report(me.id, WEEK, 'weekly'))

    assert '€200,00' in html
    assert '€3.000,00' in html
    assert '$' not in html


# --- escaping -------------------------------------------------------------

def test_a_name_with_markup_in_it_is_escaped(db):
    """Category and account names are user input and land in an HTML document.

    Not a stored-XSS worry in a mail client so much as a rendering one: an
    unescaped `<` silently eats the rest of the row.
    """
    me = UserFactory(name='Harun & Co')
    account = AccountFactory(user_id=me.id, name='<b>Current</b>',
                             type='checking', balance=Decimal('10.00'))
    category = CategoryFactory(name='Beans & <script>', user_id=me.id)
    ExpenseFactory(user_id=me.id, account_id=account.id, amount=Decimal('5.00'),
                   date=INSIDE, paid_by=me.id, category_id=category.id)

    html = render_html(build_report(me.id, WEEK, 'weekly'))

    assert '<script>' not in html
    assert 'Beans &amp; &lt;script&gt;' in html
    assert '&lt;b&gt;Current&lt;/b&gt;' in html
    assert 'Harun &amp; Co' in html


# --- the empty states -----------------------------------------------------

def test_a_period_with_no_spending_says_so_rather_than_showing_nothing(db):
    """A blank section reads as a broken email; "nothing" is a fact worth
    stating. `delivery.py` is what decides not to send at all."""
    user = UserFactory(name='Ann')
    AccountFactory(user_id=user.id, type='checking', balance=Decimal('500.00'))

    html = render_html(build_report(user.id, WEEK, 'weekly'))

    assert 'No spending' in html
    assert '$500.00' in html


def test_a_household_with_no_debts_between_it_says_so(db):
    user = UserFactory(name='Ann')
    AccountFactory(user_id=user.id, type='checking', balance=Decimal('500.00'))

    html = render_html(build_report(user.id, WEEK, 'weekly'))

    assert 'nobody owes' in html.lower() or 'no repayments' in html.lower()


def test_a_monthly_report_with_no_history_renders_no_flat_line(db):
    user = UserFactory(name='Ann')
    AccountFactory(user_id=user.id, type='checking', balance=Decimal('500.00'))

    html = render_html(build_report(user.id, MONTH, 'monthly'))

    assert 'Net worth' in html
    assert 'NaN' not in html


# --- cadence differences --------------------------------------------------

def test_the_monthly_report_shows_the_trend_and_the_weekly_one_does_not(db):
    me, _ = _household()
    account = AccountFactory(user_id=me.id, type='savings',
                             balance=Decimal('900.00'))
    for month in (6, 7, 8):
        ExpenseFactory(user_id=me.id, account_id=account.id,
                       amount=Decimal('100.00'), date=datetime(2026, month, 10),
                       paid_by=me.id)

    monthly = render_html(build_report(me.id, MONTH, 'monthly'))
    weekly = render_html(build_report(me.id, WEEK, 'weekly'))

    assert '2026-07' in monthly
    assert '2026-07' not in weekly


def test_a_monthly_delta_is_rendered_with_its_direction(db):
    me = UserFactory(name='Harun')
    account = AccountFactory(user_id=me.id, type='checking',
                             balance=Decimal('100.00'))
    food = CategoryFactory(name='Groceries', user_id=me.id)
    ExpenseFactory(user_id=me.id, account_id=account.id, amount=Decimal('200.00'),
                   date=AUGUST_DAY, paid_by=me.id, category_id=food.id)
    ExpenseFactory(user_id=me.id, account_id=account.id, amount=Decimal('150.00'),
                   date=datetime(2026, 7, 15), paid_by=me.id, category_id=food.id)

    html = render_html(build_report(me.id, MONTH, 'monthly'))

    # +$50.00 against last month, and the arrow that says which way.
    assert '$50.00' in html
    assert '▲' in html or 'up' in html.lower()


# --- purity ---------------------------------------------------------------

def test_the_renderer_touches_no_database(db):
    """Pure `dict -> str`. If it queried, it could disagree with the payload
    it was handed — and it could not be tested without a database at all."""
    me, _ = _household()
    report = build_report(me.id, WEEK, 'weekly')

    _db.session.remove()

    assert '$200.00' in render_html(report)
