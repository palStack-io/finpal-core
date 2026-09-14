"""Coverage for the conditional acts, and the overpaid-card trap.

*** CARD DEBT IS A NEGATIVE BALANCE, AND AN OVERPAID CARD IS NOT DEBT. *** The
temptation is `abs(balance)`, which counts a card the bank owes YOU as money you
owe THEM — D-176's exact arithmetic one table over. Asserted directly.
"""

from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.services.literacy import coverage, payoff
from tests.factories import AccountFactory, UserFactory

ONE = Decimal('1')


def _card(user_id, name, balance, apr=None, limit=None, minimum=None):
    card = AccountFactory(user_id=user_id, name=name, type='credit',
                          balance=balance)
    _db.session.commit()
    card.apr, card.credit_limit, card.min_payment = apr, limit, minimum
    _db.session.commit()
    return card


def test_a_user_who_owes_nothing_is_DORMANT_on_every_debt_act(db):
    UserFactory(id='clear@test.com', name='Clear')
    _db.session.commit()
    for act in ('debt_rates', 'debt_limits', 'debt_minimums'):
        assert getattr(coverage, act)('clear@test.com') is None, act


def test_rates_are_weighted_by_WHAT_IS_OWED_not_by_card_count(db):
    user = UserFactory(id='mixed@test.com', name='Mixed')
    _db.session.commit()
    _card(user.id, 'Big', -8000.0, apr=19.99)     # recorded
    _card(user.id, 'Small', -2000.0)              # not recorded

    got = coverage.debt_rates('mixed@test.com')
    # By count this is 0.5. By what is owed it is 8000/10000 = 0.8.
    assert got == Decimal('0.8'), f'weighted by count, not by what is owed: {got}'


def test_recording_every_rate_reaches_EXACTLY_one(db):
    user = UserFactory(id='thorough@test.com', name='Thorough')
    _db.session.commit()
    _card(user.id, 'A', -500.0, apr=19.99)
    _card(user.id, 'B', -1500.0, apr=22.9)

    assert coverage.debt_rates('thorough@test.com') == ONE


def test_an_OVERPAID_CARD_IS_NOT_DEBT(db):
    """*** THE D-176 TRAP. *** A positive balance means the bank owes the user.
    `abs()` would count it as debt and drag coverage down for a card that is
    not a problem at all."""
    user = UserFactory(id='overpaid@test.com', name='Overpaid')
    _db.session.commit()
    _card(user.id, 'Owed', -1000.0, apr=19.99)
    _card(user.id, 'Overpaid', 400.0)          # in credit, no APR recorded

    got = coverage.debt_rates('overpaid@test.com')
    assert got == ONE, (
        f'got {got}: the overpaid card was counted as debt. What is owed is '
        '-balance, never abs(balance) — D-176, one table over.')


def test_the_payoff_names_the_real_arithmetic(db):
    """demo1's actual card: -800.00 at 19.99% with a 35.00 minimum."""
    user = UserFactory(id='demo1ish@test.com', name='Demo')
    _db.session.commit()
    _card(user.id, 'Visa Credit Card', -800.0, apr=19.99, limit=3200.0, minimum=35.0)

    line = payoff.debt_rates('demo1ish@test.com')

    assert '13.33' in line, f'interest per month wrong: {line}'
    assert '21.67' in line, f'principal per payment wrong: {line}'
    assert '35.00' in line
    assert '38%' in line, f'the share that is rent on the debt is wrong: {line}'


def test_the_payoff_says_NOTHING_when_it_cannot_compute_the_consequence(db):
    """*** NO COMPUTABLE CONSEQUENCE, NO SENTENCE. *** Asserted on the absence
    of a sentence, which is the only honest way to test a fail-closed rule."""
    user = UserFactory(id='norate@test.com', name='NoRate')
    _db.session.commit()
    _card(user.id, 'Unknown', -800.0)          # no APR at all

    assert payoff.debt_rates('norate@test.com') is None


def test_a_card_in_credit_gets_no_payoff_sentence_either(db):
    user = UserFactory(id='credit@test.com', name='InCredit')
    _db.session.commit()
    _card(user.id, 'Overpaid', 400.0, apr=19.99)

    assert payoff.debt_rates('credit@test.com') is None
