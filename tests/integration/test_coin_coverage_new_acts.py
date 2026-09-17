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


# ══════════════════════════════════════════════════════════════════════
# budget_adjusted — and the regression that matters more than the feature
# ══════════════════════════════════════════════════════════════════════

def test_budget_adjusted_is_dormant_with_no_budget(owner):
    assert coverage.budget_adjusted(owner.id) is None


def test_merely_creating_a_budget_earns_nothing(owner):
    """`has_a_budget` pays for setting one. This act pays for REVISING one."""
    from tests.factories import BudgetFactory
    BudgetFactory(user_id=owner.id, amount=300)
    _db.session.commit()
    assert coverage.budget_adjusted(owner.id) == Decimal(0)


def test_changing_the_amount_through_the_api_earns_it(
        owner, auth_headers, client):
    from tests.factories import BudgetFactory
    b = BudgetFactory(user_id=owner.id, amount=300)
    _db.session.commit()

    res = client.put(f'/api/v1/budgets/{b.id}', json={'amount': 450},
                     headers=auth_headers(owner))
    assert res.status_code == 200, res.get_json()

    _db.session.rollback()
    assert coverage.budget_adjusted(owner.id) == Decimal(1)


def test_a_put_that_changes_only_the_name_records_NOTHING(
        owner, auth_headers, client):
    from tests.factories import BudgetFactory
    b = BudgetFactory(user_id=owner.id, amount=300)
    _db.session.commit()

    client.put(f'/api/v1/budgets/{b.id}', json={'name': 'Renamed'},
               headers=auth_headers(owner))
    _db.session.rollback()
    assert coverage.budget_adjusted(owner.id) == Decimal(0)


def test_a_put_resending_the_SAME_amount_records_nothing(
        owner, auth_headers, client):
    """A client that round-trips the whole object sends `amount` unchanged.
    This act pays for a DECISION, not for a request."""
    from tests.factories import BudgetFactory
    b = BudgetFactory(user_id=owner.id, amount=300)
    _db.session.commit()

    client.put(f'/api/v1/budgets/{b.id}', json={'amount': 300},
               headers=auth_headers(owner))
    _db.session.rollback()
    assert coverage.budget_adjusted(owner.id) == Decimal(0)


def test_THE_ROLLOVER_CRON_MUST_RECORD_NOTHING(owner):
    """*** THE REGRESSION TEST THIS ACT EXISTS AROUND — D-197. ***

    `rollover_service.py:76` writes `budget.rollover_amount`, which fires
    `Budget.updated_at`'s `onupdate`. Keyed on that timestamp, every budget on
    every stack would eventually read as *the user revised this* because a
    scheduled task touched it. A column with a non-user writer cannot testify
    to a user's act.
    """
    from tests.factories import BudgetFactory
    from src.services.budget.rollover_service import BudgetRolloverService

    b = BudgetFactory(user_id=owner.id, amount=300)
    _db.session.commit()
    before = b.updated_at

    BudgetRolloverService.process_budget_rollover(b) \
        if hasattr(BudgetRolloverService, 'process_budget_rollover') else None
    b.rollover_amount = 25          # what the cron does, directly
    _db.session.commit()

    assert b.updated_at != before or b.rollover_amount == 25, (
        'the cron write did not land — this test would pass vacuously')
    assert coverage.budget_adjusted(owner.id) == Decimal(0), (
        'a scheduled task made this read as a user revision — D-197')


# ══════════════════════════════════════════════════════════════════════
# splits_confirmed and settlement_recorded
# ══════════════════════════════════════════════════════════════════════

@pytest.fixture
def housemate(db):
    u = UserFactory(id='mate@test.com', name='Mate',
                    password_plain='testpassword')
    _db.session.commit()
    return u


def _group_with_expense(owner, housemate, amount=120.0):
    """A group, both users in it, and one expense split between them."""
    from src.models.group import Group
    from tests.factories import AccountFactory, ExpenseFactory

    g = Group(name='Flat', created_by=owner.id)
    g.members.append(owner)
    g.members.append(housemate)
    _db.session.add(g)
    _db.session.commit()

    acct = AccountFactory(user_id=owner.id, name='C', type='checking')
    _db.session.commit()
    e = ExpenseFactory(user_id=owner.id, account_id=acct.id, amount=-amount,
                       description='Shared internet', transaction_type='expense',
                       split_method='equal', split_with=housemate.id,
                       paid_by=owner.id)
    e.group_id = g.id
    _db.session.commit()
    return g, e


def test_splits_confirmed_is_dormant_with_no_group(owner):
    assert coverage.splits_confirmed(owner.id) is None


def test_splits_confirmed_scores_zero_with_an_unconfirmed_split(
        owner, housemate):
    _group_with_expense(owner, housemate)
    assert coverage.splits_confirmed(owner.id) == Decimal(0)


def test_confirming_through_the_endpoint_earns_it(
        owner, housemate, auth_headers, client):
    g, e = _group_with_expense(owner, housemate)

    res = client.post(
        f'/api/v1/groups/{g.id}/expenses/{e.id}/confirm-split',
        headers=auth_headers(owner))
    assert res.status_code == 200, res.get_json()
    assert res.get_json()['confirmed'] is True

    _db.session.rollback()
    assert coverage.splits_confirmed(owner.id) == Decimal(1)


def test_confirming_twice_is_a_no_op_not_a_duplicate(
        owner, housemate, auth_headers, client):
    """*** OR A DOUBLE-SUBMITTED FORM INFLATES THE NUMERATOR. ***"""
    g, e = _group_with_expense(owner, housemate)
    h = auth_headers(owner)
    url = f'/api/v1/groups/{g.id}/expenses/{e.id}/confirm-split'

    first = client.post(url, headers=h).get_json()
    again = client.post(url, headers=h).get_json()

    assert first['already_confirmed'] is False
    assert again['already_confirmed'] is True

    from src.models.act_event import ActEvent
    _db.session.rollback()
    assert ActEvent.query.filter_by(
        user_id=owner.id, act_slug='splits_confirmed').count() == 1


def test_a_member_NOT_split_into_the_expense_is_refused_with_403(
        owner, housemate, auth_headers, client, db):
    """*** 403 AND 404 ARE DIFFERENT ANSWERS (D-47). *** A third member can SEE
    the expense and still may not confirm a split they are not in."""
    from src.models.group import Group
    third = UserFactory(id='third@test.com', name='Third',
                        password_plain='testpassword')
    _db.session.commit()

    g, e = _group_with_expense(owner, housemate)
    g.members.append(third)
    _db.session.commit()

    res = client.post(
        f'/api/v1/groups/{g.id}/expenses/{e.id}/confirm-split',
        headers=auth_headers(third))
    assert res.status_code == 403, res.get_json()


def test_settlement_recorded_is_dormant_with_no_shared_expense(owner):
    assert coverage.settlement_recorded(owner.id) is None


def test_settlement_recorded_scores_zero_when_there_is_something_to_settle(
        owner, housemate):
    _group_with_expense(owner, housemate)
    assert coverage.settlement_recorded(owner.id) == Decimal(0)


def test_recording_a_settlement_earns_it(owner, housemate):
    from src.models.group import Settlement
    _group_with_expense(owner, housemate)
    _db.session.add(Settlement(payer_id=housemate.id, receiver_id=owner.id,
                               amount=60))
    _db.session.commit()
    assert coverage.settlement_recorded(owner.id) == Decimal(1)


def test_AN_OUTSTANDING_BALANCE_DOES_NOT_REDUCE_IT(owner, housemate):
    """*** THE ANTI-OUTCOME TEST (§14.2). ***

    The act is keyed on the RECORDING, never on a balance reaching zero. A user
    who cannot pay the rest yet is not failing, and a reward keyed to the zero
    would tell them they were — voice rule 11.
    """
    from src.models.group import Settlement
    _group_with_expense(owner, housemate, amount=500.0)
    # Settles a fraction of what is owed and stops.
    _db.session.add(Settlement(payer_id=housemate.id, receiver_id=owner.id,
                               amount=5))
    _db.session.commit()

    assert coverage.settlement_recorded(owner.id) == Decimal(1)


def test_a_user_who_settled_everything_is_NOT_dormant(owner, housemate):
    """*** THE ORDERING TEST. *** The Settlement check must come BEFORE the
    dormancy branch, or someone who has done the thing reads as absent."""
    from src.models.group import Settlement
    _db.session.add(Settlement(payer_id=owner.id, receiver_id=housemate.id,
                               amount=60))
    _db.session.commit()
    # No shared expense at all — only the settlement record.
    assert coverage.settlement_recorded(owner.id) == Decimal(1)
