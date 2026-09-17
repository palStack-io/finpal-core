"""Coverage and payoff for the acts the 2026-09-17 amendment added.

*** THE ASSERTIONS THAT MATTER MOST ARE THE DORMANT ONES. *** A user with no
holdings is not failing at `holdings_priced` — the act is ABSENT for them
(§4.2.1). `coverage` returning `Decimal(0)` instead of `None` turns an absence
into a score, which is the report-card voice the whole design forbids.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.investment import Investment, Portfolio
from src.services.literacy import coverage, payoff
from tests.factories import UserFactory

USER = 'newacts@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='NewActs', password_plain='testpassword')
    _db.session.commit()
    return u


@pytest.fixture
def portfolio(owner):
    p = Portfolio(name='P', user_id=owner.id)
    _db.session.add(p)
    _db.session.commit()
    return p


def _holding(portfolio, symbol, shares, purchase_price, current_price=100):
    h = Investment(portfolio_id=portfolio.id, symbol=symbol, shares=shares,
                   purchase_price=purchase_price, current_price=current_price)
    _db.session.add(h)
    _db.session.commit()
    return h


# ══════════════════════════════════════════════════════════════════════
# holdings_priced
# ══════════════════════════════════════════════════════════════════════

def test_a_user_with_no_holdings_is_DORMANT_not_zero(owner):
    """*** ABSENT, NOT FAILING. ***"""
    assert coverage.holdings_priced(owner.id) is None


def test_a_user_with_an_empty_portfolio_is_still_dormant(owner, portfolio):
    assert coverage.holdings_priced(owner.id) is None


def test_an_unpriced_holding_scores_zero(owner, portfolio):
    """Zero is right HERE: the act is live and they have not done it."""
    _holding(portfolio, 'VTI', 10, 0)
    assert coverage.holdings_priced(owner.id) == Decimal(0)


def test_half_priced_scores_a_half(owner, portfolio):
    _holding(portfolio, 'VTI', 10, 50)
    _holding(portfolio, 'VXUS', 10, 0)
    assert coverage.holdings_priced(owner.id) == Decimal('0.5')


def test_all_priced_scores_one(owner, portfolio):
    _holding(portfolio, 'VTI', 10, 50)
    _holding(portfolio, 'VXUS', 10, 60)
    assert coverage.holdings_priced(owner.id) == Decimal(1)


def test_it_does_not_count_a_housemates_holdings(owner, portfolio, db):
    """*** PER-USER, NOT HOUSEHOLD-SCOPED. *** The Investments page shows more
    than this denominator, deliberately: coins measure the user's OWN picture,
    and a holding they may not write is not a figure they can fix."""
    other = UserFactory(id='newacts2@test.com', name='O',
                        password_plain='testpassword')
    _db.session.commit()
    theirs = Portfolio(name='Theirs', user_id=other.id)
    _db.session.add(theirs)
    _db.session.commit()

    _holding(portfolio, 'VTI', 10, 50)       # mine, priced
    _holding(theirs, 'VXUS', 10, 0)          # theirs, unpriced

    assert coverage.holdings_priced(owner.id) == Decimal(1)


def test_the_payoff_names_the_real_gain_not_the_market_value(owner, portfolio):
    _holding(portfolio, 'VTI', 10, 50, current_price=80)
    sentence = payoff.holdings_priced(owner.id)

    assert sentence is not None
    assert '500' in sentence          # cost 10 x 50
    assert '800' in sentence          # value 10 x 80
    assert '300' in sentence          # gain
    assert 'up' in sentence


def test_the_payoff_is_NONE_when_nothing_is_priced(owner, portfolio):
    """*** NO COMPUTABLE CONSEQUENCE, NO SENTENCE. *** Four payoffs were caught
    on 2026-09-14 claiming an act was done beside `coins: 0`."""
    _holding(portfolio, 'VTI', 10, 0)
    assert payoff.holdings_priced(owner.id) is None


def test_the_payoff_is_NONE_with_no_holdings_at_all(owner):
    assert payoff.holdings_priced(owner.id) is None


def test_a_loss_is_named_as_down_not_as_a_negative_gain(owner, portfolio):
    _holding(portfolio, 'VTI', 10, 80, current_price=50)
    sentence = payoff.holdings_priced(owner.id)
    assert sentence is not None
    assert 'down' in sentence


# ══════════════════════════════════════════════════════════════════════
# _binary_conditional — the helper the event acts need
# ══════════════════════════════════════════════════════════════════════

def test_binary_conditional_is_dormant_when_not_possible():
    assert coverage._binary_conditional(False, False) is None
    assert coverage._binary_conditional(False, True) is None


def test_binary_conditional_scores_the_genuine_middle(owner):
    assert coverage._binary_conditional(True, False) == Decimal(0)
    assert coverage._binary_conditional(True, True) == Decimal(1)
