"""The method a user chooses for clearing debts, and what it orders.

*** ONE PLAN PER USER, NOT ONE PER GOAL. *** Avalanche and snowball are
orderings ACROSS debts; "pay this one first because it costs most" is
meaningless about a single goal alone. A per-goal method would let somebody
hold two contradictory orderings and finPal would have to pick one to report.

*** AND IT IS A TABLE, NOT COLUMNS ON `Goal`. *** The deploy calls
`create_all()`, which creates missing TABLES and never missing COLUMNS (D-121)
-- so a `Goal.payoff_method` column would apply here and silently never appear
on a running stack.
"""
from decimal import Decimal

from src.extensions import db as _db
from src.models.debt_plan import AVALANCHE, DebtPlan, SNOWBALL
from src.services.goal.projection import order_debts
from tests.factories import UserFactory, AccountFactory

URL = '/api/v1/goals/debt-plan'


def _card(user_id, name, balance, apr=None):
    account = AccountFactory(user_id=user_id, name=name, type='credit', balance=balance)
    if apr is not None:
        account.apr = Decimal(str(apr))
    _db.session.commit()
    return account


def test_avalanche_is_dearest_first_and_snowball_is_smallest_first(db):
    user = UserFactory()
    big_cheap = _card(user.id, 'Big cheap', -5000.0, 5.0)
    small_dear = _card(user.id, 'Small dear', -300.0, 24.99)

    assert [a.name for a in order_debts([big_cheap, small_dear], AVALANCHE)] \
        == ['Small dear', 'Big cheap']
    assert [a.name for a in order_debts([big_cheap, small_dear], SNOWBALL)] \
        == ['Small dear', 'Big cheap']

    # Make the orders differ, so the test can tell them apart at all.
    big_dear = _card(user.id, 'Big dear', -5000.0, 24.99)
    small_cheap = _card(user.id, 'Small cheap', -300.0, 5.0)
    assert [a.name for a in order_debts([small_cheap, big_dear], AVALANCHE)] \
        == ['Big dear', 'Small cheap']
    assert [a.name for a in order_debts([small_cheap, big_dear], SNOWBALL)] \
        == ['Small cheap', 'Big dear']


def test_AN_ACCOUNT_WITH_NO_RATE_SORTS_LAST_UNDER_AVALANCHE(db):
    """*** A MISSING APR IS NOT 0%. ***

    Treating it as zero sends it to the back for the wrong reason; treating it
    as huge sends it to the front on a number nobody gave. It sorts last
    explicitly, which is a decision rather than an accident of arithmetic.
    """
    user = UserFactory()
    # *** A 0% CARD IS WHAT MAKES THIS TEST DISCRIMINATE. *** Against a 10%
    # card, "treat None as 0" ALSO sorts the unrated one last, and the first
    # version of this test passed its own sabotage for that reason -- a hole
    # in the test, not a bad sabotage. A real 0% balance transfer ties with a
    # None on the rate key, so only the explicit `apr is None` term can
    # separate them, and the balances are set so a tie would order them the
    # other way round.
    zero_pct = _card(user.id, 'Balance transfer', -5000.0, 0)
    unrated = _card(user.id, 'No rate', -100.0, None)

    assert [a.name for a in order_debts([unrated, zero_pct], AVALANCHE)] \
        == ['Balance transfer', 'No rate']


def test_an_account_in_credit_is_not_a_debt(db):
    user = UserFactory()
    owed = _card(user.id, 'Visa', -500.0, 20.0)
    AccountFactory(user_id=user.id, name='Savings', type='savings', balance=900.0)
    _db.session.commit()
    from src.models.account import Account
    rows = Account.query.filter_by(user_id=user.id).all()
    assert [a.name for a in order_debts(rows, AVALANCHE)] == ['Visa']


def test_choosing_a_method_stores_it_and_reports_the_order(client, db, auth_headers):
    user = UserFactory()
    _card(user.id, 'Big cheap', -5000.0, 5.0)
    _card(user.id, 'Small dear', -300.0, 24.99)

    put = client.put(URL, json={'method': 'avalanche', 'monthly_amount': 250},
                     headers=auth_headers(user))
    assert put.status_code == 200

    body = client.get(URL, headers=auth_headers(user)).get_json()
    assert body['plan']['method'] == 'avalanche'
    assert body['plan']['monthly_amount'] == 250.0
    assert [a['name'] for a in body['plan']['order']] == ['Small dear', 'Big cheap']


def test_SWITCHING_METHOD_DOES_NOT_SILENTLY_CLEAR_THE_AMOUNT(client, db, auth_headers):
    """Absent means unchanged, not cleared.

    Somebody switching ordering should not lose the figure they recorded.
    """
    user = UserFactory()
    client.put(URL, json={'method': 'avalanche', 'monthly_amount': 250},
               headers=auth_headers(user))
    client.put(URL, json={'method': 'snowball'}, headers=auth_headers(user))

    body = client.get(URL, headers=auth_headers(user)).get_json()
    assert body['plan']['method'] == 'snowball'
    assert body['plan']['monthly_amount'] == 250.0


def test_a_method_with_no_amount_is_allowed(client, db, auth_headers):
    """The ordering is useful before somebody knows what they can afford.

    Refusing to record the choice until they name a number loses the choice.
    """
    user = UserFactory()
    assert client.put(URL, json={'method': 'snowball'},
                      headers=auth_headers(user)).status_code == 200
    assert client.get(URL, headers=auth_headers(user)).get_json()['plan']['monthly_amount'] is None


def test_a_nonsense_method_is_refused(client, db, auth_headers):
    user = UserFactory()
    resp = client.put(URL, json={'method': 'whatever'}, headers=auth_headers(user))
    assert resp.status_code == 400
    assert 'avalanche' in resp.get_json()['error']


def test_no_plan_is_a_null_not_an_error(client, db, auth_headers):
    user = UserFactory()
    body = client.get(URL, headers=auth_headers(user)).get_json()
    assert body['success'] is True and body['plan'] is None
