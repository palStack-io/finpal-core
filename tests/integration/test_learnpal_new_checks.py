"""The eight predicates the eleven approved lessons unlock on.

*** EVERY DEFINITION HERE WAS A DECISION, NOT A SPECIFICATION. ***
`2026-09-10-learnpal-lesson-drafts-2.md` names each `check_type` and says
nothing about what it means in SQL. So every predicate gets BOTH cases: the one
that opens it and the near-miss that must not. **An unlock is permanent** — a
wrong True can never be taken back, while a wrong False costs one evaluation
cycle — so the near-miss is the assertion that matters.
"""

from datetime import datetime
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.category import Category
from src.models.goal import Goal
from src.models.recurring import RecurringExpense
from src.modules.learnpal.checks import CHECKS, _is_paydown
from src.modules.learnpal.models import LearnCompletion
from src.modules.learnpal.seed import seed_milestones
from src.services.goal.service import GoalService
from tests.factories import UserFactory, AccountFactory, ExpenseFactory

check = CHECKS.__getitem__


@pytest.fixture
def user(db):
    return UserFactory(id='checks@test.com', name='Checks')


def _debt(user_id, name='Visa', balance='-800.00', type_='credit'):
    a = AccountFactory(user_id=user_id, name=name, type=type_,
                       balance=Decimal(balance))
    _db.session.commit()
    return a


def _income(user_id, when, amount='4500.00'):
    # *** THE FACTORY, NOT A BARE MODEL. *** `expenses` has several NOT NULL
    # columns with no Python-side default (`card_used`, `split_method`), so a
    # hand-built row fails on SQLite and would fail on Postgres too. The factory
    # is the one place that knows the minimum viable row.
    return ExpenseFactory(user_id=user_id, description='Salary',
                          amount=Decimal(amount), date=when,
                          transaction_type='income')


def _goal(user_id, start, target, **kw):
    g = Goal(user_id=user_id, name=kw.pop('name', 'A goal'),
             kind=kw.pop('kind', 'savings'),
             start_amount=Decimal(start), target_amount=Decimal(target),
             currency_code='USD', status=kw.pop('status', 'active'), **kw)
    _db.session.add(g)
    _db.session.commit()
    return g


# ---------------------------------------------------------------------------
# The mirror of GoalService.direction
# ---------------------------------------------------------------------------

def test_THE_DIRECTION_MIRROR_AGREES_WITH_THE_SERVICE_ON_EVERY_SHAPE(user, app):
    """*** A SECOND COPY OF A RULE IS THIS PROJECT'S RECURRING FAILURE, SO THE
    COPY IS PINNED TO THE ORIGINAL. *** `checks.py` may not import
    `GoalService` -- a predicate must not be able to write, and
    `stamp_if_achieved` commits -- so the column rule is mirrored. This asserts
    the mirror, including the case the spec's literal rule got WRONG: card debt
    is a negative balance, so paying a card off moves the number UP and
    `target > start` on a paydown goal."""
    service = GoalService()
    shapes = [
        ('-1650.00', '0.00'),      # payoff: start negative, target higher
        ('0.00', '16000.00'),      # savings
        ('5000.00', '0.00'),       # drawdown: target below start
        ('0.00', '0.00'),          # degenerate
        ('-50.00', '-10.00'),      # still in debt at target
    ]
    for start, target in shapes:
        g = _goal(user.id, start, target)
        assert _is_paydown(g) == (service.direction(g) == 'paydown'), \
            f'the mirror disagreed on {start} -> {target}'


# ---------------------------------------------------------------------------
# Lesson 9
# ---------------------------------------------------------------------------

def test_two_months_of_income_needs_TWO_MONTHS_not_two_transactions(user, app):
    """*** THE NEAR-MISS IS THE POINT. *** Two income rows in ONE month say
    nothing about what regularly arrives, and lesson 9 is about variance."""
    _income(user.id, datetime(2026, 8, 1))
    _income(user.id, datetime(2026, 8, 26), '320.00')
    assert check('has_two_months_of_income')(user.id, None) is False

    _income(user.id, datetime(2026, 9, 1))
    assert check('has_two_months_of_income')(user.id, None) is True


def test_an_EXPENSE_is_not_income(user, app):
    for d in (datetime(2026, 8, 1), datetime(2026, 9, 1)):
        ExpenseFactory(user_id=user.id, description='Rent',
                       amount=Decimal('1200'), date=d,
                       transaction_type='expense')
    assert check('has_two_months_of_income')(user.id, None) is False


# ---------------------------------------------------------------------------
# Lesson 10 — a RATIO needs both halves
# ---------------------------------------------------------------------------

def test_debt_to_income_needs_BOTH_or_the_figure_is_undefined(user, app):
    _debt(user.id)
    assert check('has_debt_account_and_income')(user.id, None) is False, \
        'opened a ratio lesson with no income to be a ratio of'

    _income(user.id, datetime(2026, 9, 1))
    assert check('has_debt_account_and_income')(user.id, None) is True


# ---------------------------------------------------------------------------
# Lesson 11 — accounts IN DEBT, not accounts of a debt type
# ---------------------------------------------------------------------------

def test_A_CLEARED_CARD_IS_NOT_A_DEBT_TO_CONSOLIDATE(user, app):
    """Two credit cards, one of them paid off, is ONE debt. Telling somebody who
    has cleared a card that they might consolidate "their debts" is the product
    misreading its own data."""
    _debt(user.id, 'Visa', '-800.00')
    _debt(user.id, 'Amex', '0.00')
    assert check('has_two_or_more_debt_accounts')(user.id, None) is False

    _debt(user.id, 'Barclaycard', '-120.00')
    assert check('has_two_or_more_debt_accounts')(user.id, None) is True


def test_AN_OVERPAID_CARD_IS_NOT_DEBT(user, app):
    """*** D-176's ARITHMETIC ONE TABLE OVER. *** A positive balance on a credit
    account is money the BANK owes the user. `abs(balance)` would count it."""
    _debt(user.id, 'Visa', '-800.00')
    _debt(user.id, 'Amex', '250.00')
    assert check('has_two_or_more_debt_accounts')(user.id, None) is False


# ---------------------------------------------------------------------------
# Lesson 12 — for the person who has NOT started one
# ---------------------------------------------------------------------------

def test_a_savings_goal_closes_the_buffer_lesson_and_an_ARCHIVED_one_does_not(
        user, app):
    _debt(user.id)
    assert check('has_debt_and_no_savings_goal')(user.id, None) is True

    archived = _goal(user.id, '0.00', '16000.00', status='archived')
    assert check('has_debt_and_no_savings_goal')(user.id, None) is True, \
        'an ABANDONED savings goal counted as having one'

    _db.session.delete(archived)
    _db.session.commit()
    _goal(user.id, '0.00', '16000.00')
    assert check('has_debt_and_no_savings_goal')(user.id, None) is False


def test_a_PAYDOWN_goal_is_not_a_savings_goal(user, app):
    _debt(user.id)
    _goal(user.id, '-1650.00', '0.00', kind='payoff')
    assert check('has_debt_and_no_savings_goal')(user.id, None) is True


def test_no_debt_means_the_buffer_lesson_does_not_fire(user, app):
    assert check('has_debt_and_no_savings_goal')(user.id, None) is False


# ---------------------------------------------------------------------------
# Lesson 14 — either mark, and weekly is MORE often than monthly
# ---------------------------------------------------------------------------

def test_non_monthly_spending_fires_on_EITHER_mark(user, app):
    assert check('has_non_monthly_spending')(user.id, None) is False

    cat = Category(user_id=user.id, name='Car insurance',
                   spending_type='non_monthly')
    _db.session.add(cat)
    _db.session.commit()
    assert check('has_non_monthly_spending')(user.id, None) is True

    _db.session.delete(cat)
    _db.session.commit()
    _db.session.add(RecurringExpense(
        user_id=user.id, description='Car insurance', amount=Decimal('462.50'),
        frequency='yearly', active=True, card_used='Primary Checking', split_method='none',
        paid_by=user.id,
        start_date=datetime(2026, 1, 4)))
    _db.session.commit()
    assert check('has_non_monthly_spending')(user.id, None) is True


def test_A_WEEKLY_BILL_IS_NOT_NON_MONTHLY(user, app):
    """*** `daily` AND `weekly` ARE MORE OFTEN THAN MONTHLY, NOT LESS. *** A
    sinking fund is for the thing that arrives once a year; folding them in
    would make the predicate true for anybody with a coffee habit."""
    for freq in ('weekly', 'daily', 'monthly'):
        _db.session.add(RecurringExpense(
            user_id=user.id, description=freq, amount=Decimal('60'),
            frequency=freq, active=True, card_used='Primary Checking',
            split_method='none', paid_by=user.id,
            start_date=datetime(2026, 2, 1)))
    _db.session.commit()
    assert check('has_non_monthly_spending')(user.id, None) is False


def test_an_INACTIVE_yearly_bill_does_not_count(user, app):
    _db.session.add(RecurringExpense(
        user_id=user.id, description='Cancelled policy', amount=Decimal('462.50'),
        frequency='yearly', active=False, card_used='Primary Checking', split_method='none',
        paid_by=user.id,
        start_date=datetime(2026, 1, 4)))
    _db.session.commit()
    assert check('has_non_monthly_spending')(user.id, None) is False


# ---------------------------------------------------------------------------
# Lesson 15
# ---------------------------------------------------------------------------

def test_recurring_income_reads_transaction_type_and_not_a_category_name(
        user, app):
    """*** `Category` HAS NO INCOME/EXPENSE COLUMN AT ALL (D-189), *** so the
    recurring row's `transaction_type` is the only place finPal records this. A
    category named "Salary" is a string a user can rename."""
    _db.session.add(RecurringExpense(
        user_id=user.id, description='Salary', amount=Decimal('4500'),
        frequency='monthly', active=True, transaction_type='expense',
        card_used='Primary Checking', split_method='none',
        paid_by=user.id,
        start_date=datetime(2026, 1, 1)))
    _db.session.commit()
    assert check('has_recurring_income')(user.id, None) is False, \
        'a row named Salary counted as income on its NAME'

    _db.session.add(RecurringExpense(
        user_id=user.id, description='Pay', amount=Decimal('4500'),
        frequency='monthly', active=True, transaction_type='income',
        card_used='Primary Checking', split_method='none',
        paid_by=user.id,
        start_date=datetime(2026, 1, 1)))
    _db.session.commit()
    assert check('has_recurring_income')(user.id, None) is True


# ---------------------------------------------------------------------------
# Lesson 17 — the buffer is read from the WATERMARK
# ---------------------------------------------------------------------------

def test_THE_BUFFER_IS_READ_FROM_THE_WATERMARK_SO_A_DIP_DOES_NOT_TAKE_IT_BACK(
        user, app):
    """*** THE PERSON WHO DIPPED INTO THE BUFFER IS EXACTLY WHO THIS LESSON IS
    FOR. *** `highest_progress` only ever rises, so a user who reached their
    target and then spent some of it has still built one. Reading live progress
    would withdraw the fork-in-the-trail lesson from the person whose dip proves
    they need it. That column is only reliably populated since D-187 wired a
    writer to it."""
    _debt(user.id)
    goal = _goal(user.id, '0.00', '16000.00')
    assert check('has_buffer_and_debt')(user.id, None) is False

    goal.highest_progress = Decimal('1.000')
    _db.session.commit()
    assert check('has_buffer_and_debt')(user.id, None) is True


def test_the_fork_needs_debt_as_well_as_a_buffer(user, app):
    goal = _goal(user.id, '0.00', '16000.00', status='achieved')
    assert check('has_buffer_and_debt')(user.id, None) is False, \
        'a fork with only one road'
    _debt(user.id)
    assert check('has_buffer_and_debt')(user.id, None) is True
    assert goal.status == 'achieved'


def test_an_achieved_PAYDOWN_goal_is_not_a_buffer(user, app):
    _debt(user.id)
    _goal(user.id, '-1650.00', '0.00', kind='payoff', status='achieved')
    assert check('has_buffer_and_debt')(user.id, None) is False


# ---------------------------------------------------------------------------
# Lesson 19
# ---------------------------------------------------------------------------

def test_what_finpal_cannot_tell_you_waits_for_three_lessons(db, user, app):
    seed_milestones()
    for i, slug in enumerate(['what-your-apr-costs', 'a-starter-buffer']):
        _db.session.add(LearnCompletion(user_id=user.id, milestone_slug=slug,
                                        verified_by='read'))
    _db.session.commit()
    assert check('has_completed_three_lessons')(user.id, None) is False

    _db.session.add(LearnCompletion(user_id=user.id,
                                    milestone_slug='where-your-money-goes',
                                    verified_by='read'))
    _db.session.commit()
    assert check('has_completed_three_lessons')(user.id, None) is True


def test_it_counts_only_THIS_users_lessons(db, user, app):
    seed_milestones()
    other = UserFactory(id='someone-else@test.com', name='Other')
    for slug in ('what-your-apr-costs', 'a-starter-buffer',
                 'where-your-money-goes'):
        _db.session.add(LearnCompletion(user_id=other.id, milestone_slug=slug,
                                        verified_by='read'))
    _db.session.commit()
    assert check('has_completed_three_lessons')(user.id, None) is False


# ---------------------------------------------------------------------------
# The seed itself
# ---------------------------------------------------------------------------

def test_EVERY_SEEDED_check_type_IS_A_PREDICATE_THAT_EXISTS(db, app):
    """*** A SEEDED ROW NAMING A `check_type` THAT DOES NOT EXIST IS SKIPPED AND
    LOGGED — IT NEVER UNLOCKS. *** That is the right default and it is also
    silent, so a typo in `MILESTONES` would ship a lesson nobody can ever open
    and no test would fail. This is the guard."""
    from src.modules.learnpal.seed import MILESTONES
    named = {m[4] for m in MILESTONES if m[4]}
    missing = named - set(CHECKS)
    assert not missing, f'seeded check_type with no predicate: {missing}'


def test_every_seeded_row_with_a_direction_uses_a_REAL_direction(db, app):
    """`applies_to_direction` holds a value of `GoalService.direction` —
    'paydown' or 'accumulate'. A row saying 'savings' would silently match no
    goal ever, which reads exactly like a lesson nobody has qualified for."""
    from src.modules.learnpal.seed import MILESTONES
    for m in MILESTONES:
        assert m[6] in (None, 'paydown', 'accumulate'), m[0]


def test_the_eleven_approved_drafts_are_all_seeded(db, app):
    from src.modules.learnpal.models import LearnMilestone
    seed_milestones()
    for slug in ['income-vs-what-lands', 'debt-to-income',
                 'when-consolidating-helps-and-when-it-doesnt',
                 'why-a-buffer-comes-first', 'how-much-is-enough',
                 'sinking-funds', 'paying-yourself-first',
                 'what-inflation-does-to-cash',
                 'when-to-stop-saving-and-start-paying-down',
                 'insurance-as-risk-transfer', 'what-finpal-cannot-tell-you']:
        assert LearnMilestone.query.filter_by(slug=slug).first() is not None, slug
