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


# ---------------------------------------------------------------------------
# How the plan is going — derived from payments, never stored
# ---------------------------------------------------------------------------

def _transfer(user, account, amount, when):
    from src.models.transaction import Expense
    row = Expense(description='Card payment', amount=amount, date=when,
                  user_id=user.id, paid_by=user.id, card_used='',
                  split_method='none', account_id=account.id,
                  transaction_type='transfer', currency_code='USD')
    _db.session.add(row)
    _db.session.commit()
    return row


def _this_month():
    from datetime import datetime
    return datetime.utcnow().replace(day=2, hour=12, minute=0, second=0, microsecond=0)


def test_it_says_ahead_on_or_behind_and_offers_nothing(db):
    """*** THE FIGURE IS THE MESSAGE. *** Owner decision, 2026-09-19.

    Somebody behind is usually behind because they could not pay, not because
    they forgot, and a prompt they cannot act on is a reminder that they are
    failing. The payload carries a number and a word, and no call to action.
    """
    from src.models.debt_plan import AVALANCHE, DebtPlan
    from src.services.goal.plan_status import plan_status

    user = UserFactory()
    card = _card(user.id, 'Visa', -800.0, 19.99)
    _db.session.add(DebtPlan(user_id=user.id, method=AVALANCHE,
                             monthly_amount=Decimal('100.00')))
    _db.session.commit()
    _transfer(user, card, 120.0, _this_month())

    status = plan_status(user.id, [user.id])
    assert status['state'] == 'ahead'
    assert status['difference'] == 20.0
    assert 'prompt' not in status and 'suggestion' not in status


def test_behind_is_stated_plainly(db):
    from src.models.debt_plan import AVALANCHE, DebtPlan
    from src.services.goal.plan_status import plan_status

    user = UserFactory()
    card = _card(user.id, 'Visa', -800.0, 19.99)
    _db.session.add(DebtPlan(user_id=user.id, method=AVALANCHE,
                             monthly_amount=Decimal('100.00')))
    _db.session.commit()
    _transfer(user, card, 40.0, _this_month())

    status = plan_status(user.id, [user.id])
    assert status['state'] == 'behind'
    assert status['difference'] == -60.0


def test_A_PLAN_WITH_NO_AMOUNT_REPORTS_NO_STATUS(db):
    """There is nothing to be ahead OF. Not a zero, not "behind"."""
    from src.models.debt_plan import DebtPlan, SNOWBALL
    from src.services.goal.plan_status import plan_status

    user = UserFactory()
    _card(user.id, 'Visa', -800.0, 19.99)
    _db.session.add(DebtPlan(user_id=user.id, method=SNOWBALL))
    _db.session.commit()

    assert plan_status(user.id, [user.id]) is None


def test_THE_STREAK_IS_THE_BEST_RUN_NEVER_THE_CURRENT(db):
    """A hard month cannot erase a run from the spring.

    Decision 1: nothing earned is ever taken away. Same rule
    `best_on_budget_run` follows, and the reason a badge can be an outcome at
    all when earning coins for one is refused.
    """
    from datetime import datetime, timedelta
    from src.models.debt_plan import AVALANCHE, DebtPlan
    from src.services.goal.plan_status import best_on_plan_run

    user = UserFactory()
    card = _card(user.id, 'Visa', -5000.0, 19.99)
    _db.session.add(DebtPlan(user_id=user.id, method=AVALANCHE,
                             monthly_amount=Decimal('100.00')))
    _db.session.commit()

    now = datetime.utcnow().replace(day=1)
    def month_back(n):
        d = now
        for _ in range(n):
            d = (d - timedelta(days=1)).replace(day=1)
        return d.replace(day=10, hour=12)

    # *** TWO RUNS, THE LONGER ONE OLDER — THAT IS WHAT MAKES THIS
    # DISCRIMINATE. *** The scan runs newest-first, so with a single run
    # `best = run` and `best = max(best, run)` agree and the sabotage passes.
    # The first version of this test had one run and did exactly that.
    #
    #   month 1  missed
    #   months 2-4  met      <- the long run, older in the scan
    #   month 5  missed
    #   months 6-7  met      <- a shorter run, oldest of all
    #
    # `best = run` would end holding 2. The rule holds 3.
    _transfer(user, card, 10.0, month_back(1))
    for n in (2, 3, 4):
        _transfer(user, card, 150.0, month_back(n))
    _transfer(user, card, 10.0, month_back(5))
    for n in (6, 7):
        _transfer(user, card, 150.0, month_back(n))

    assert best_on_plan_run(user.id, [user.id]) == 3


def test_the_payload_names_the_currency_its_figures_are_in(client, db, auth_headers):
    """D-278. A payload of bare numbers in mixed currencies cannot be rendered.

    *** FOUND ON THE iOS SIMULATOR, NOT BY A TEST. *** A euro household's
    DOLLAR card printed as `€600.00` — the client had no per-figure currency
    and reached for the first account's. Two faults, and only one was the
    client's: the server was sending `balance` straight off the row while the
    reader's symbol came from somewhere else entirely. That is **D-156**, the
    defect owner decision B1 (2026-09-08) settled for the dashboard.
    """
    user = UserFactory()
    _card(user.id, 'Visa', -800, apr=19.99)
    client.put(URL, json={'method': 'avalanche', 'monthly_amount': 250},
               headers=auth_headers(user))

    plan = client.get(URL, headers=auth_headers(user)).get_json()['plan']

    # *** THE KEY MUST BE PRESENT. *** Without it a client has to guess, and
    # the guess it reached for was "the first account's code".
    assert 'currency_code' in plan, 'no currency on a payload full of money'


def test_snowball_ranks_by_the_CONVERTED_size(db):
    """*** THE FIXTURE IS CHOSEN SO THE TWO ORDERS DISAGREE. ***

    Three sabotages passed in this session, every one a fixture hole. The hole
    here is balances whose ranking is the same converted or not — a test built
    on those passes whether or not the conversion happens. So the raw numbers
    say one thing and the converted ones say the opposite: 900 of a currency
    worth half as much is SMALLER than 500 of the base, and only a comparison
    that converts can see it.
    """
    user = UserFactory()
    small_but_big_number = _card(user.id, 'Weak currency card', -900)
    big_but_small_number = _card(user.id, 'Base currency card', -500)

    # Raw: 500 < 900, so the base card sorts first.
    raw = order_debts([small_but_big_number, big_but_small_number], SNOWBALL)
    assert [a.name for a in raw] == ['Base currency card', 'Weak currency card']

    # Converted: the 900 is worth 450, so it sorts first. Opposite answer.
    converted = order_debts(
        [small_but_big_number, big_but_small_number], SNOWBALL,
        balances={small_but_big_number.id: Decimal('-450'),
                  big_but_small_number.id: Decimal('-500')})
    assert [a.name for a in converted] == ['Weak currency card', 'Base currency card']


def test_avalanche_does_not_need_the_conversion(db):
    """A rate is unitless, so the ordering by APR cannot move.

    Asserted because the opposite mistake — threading `balances` into avalanche
    as though it changed the answer — would look like caution and would hide a
    real failure: if this order DID move with the balances, the sort key would
    be reading the wrong thing.
    """
    user = UserFactory()
    cheap_big = _card(user.id, 'Cheap and large', -9000, apr=3.0)
    dear_small = _card(user.id, 'Dear and small', -200, apr=24.99)

    without = order_debts([cheap_big, dear_small], AVALANCHE)
    with_rates = order_debts([cheap_big, dear_small], AVALANCHE,
                             balances={cheap_big.id: Decimal('-1'),
                                       dear_small.id: Decimal('-99999')})
    assert [a.name for a in without] == ['Dear and small', 'Cheap and large']
    assert [a.name for a in with_rates] == [a.name for a in without]
