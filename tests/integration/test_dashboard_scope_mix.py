"""Which scope each `/analytics/dashboard` field carries.

`src/utils/household.py` says "One finPal instance = one household. All users
share the same data", and `get_all_user_ids()` returns every user on the
instance. `/accounts`, `/budgets`, `/categories`, `/investments` and the
dashboard use it. The owner's decision (2026-08-04, AUDIT.md D-01) was to **keep
both scopings and label them** in the UI rather than change which query a handler
uses.

**`/api/v1/transactions/` no longer filters to the caller — D-18 items B+D,
2026-08-06.** It is household-scoped now, keyed to the owner of each row's account,
with an optional `member_id` filter; see `test_transaction_scope_contract.py`. That
retires D-01's per-figure tags on the transactions page only. **Everything this file
characterises is unchanged**, because the analytics queries were deliberately left
for item E: `api/v1/analytics.py` still takes no member parameter at all, so a
dashboard filter would have had nothing to pass. That is why the dashboard did not
get the control in the same pass — a filter that re-scoped the recent-transactions
strip while net worth and savings rate ignored it would be an affordance that lies,
which is D-18's own failure mode.

So this file is still the before/after record it was written to be, and the "after"
half of it is item E's job.

Labelling only works if the labels are per field, because this one payload is
not uniformly scoped:

    net_worth / total_assets / total_debts   the caller's own accounts
    total_expenses* / current_month_total    the caller's *share* of splits
    total_income / current_month_income      every income row in the household
    expenses / top_categories / monthly_*    every expense row in the household

The income asymmetry is the one that is easy to get wrong: the income loop in
`AnalyticsService.get_dashboard_data` sums `expense.amount` over the household
query with no split share and no user filter, while the expense loop a few lines
below takes `user_share`. So a household member who has entered nothing sees
somebody else's income as their own — and `net_cash_flow` and `savings_rate`,
which subtract a user-scoped figure from a household-scoped one, come out as a
100% savings rate for a user with no activity at all.

These tests characterise that on purpose. They are what the UI labels are
written against; if the scoping of a field ever changes, the label is wrong and
one of these fails.

The other half of the pair is `mobile/src/utils/scope.ts`
(`DASHBOARD_SUMMARY_SCOPE`) with `mobile/src/__tests__/scope.test.ts`. Nothing
but these two files connects "what the backend does" to "what the screen claims",
so if you change the scoping here, change the labels there — and keep the two
docstrings pointing at each other.
"""

from datetime import datetime

import pytest

from tests.factories import AccountFactory, ExpenseFactory, UserFactory

ENDPOINT = '/api/v1/analytics/dashboard'


@pytest.fixture
def spender(db):
    """The household member who owns every row in these tests."""
    return UserFactory(password_plain='secret')


@pytest.fixture
def bystander(db):
    """A second member of the same household who has entered nothing."""
    return UserFactory(password_plain='secret')


@pytest.fixture
def seeded(spender):
    """One income row, one expense row and one account, all owned by `spender`."""
    now = datetime.utcnow().replace(day=15, hour=12, minute=0, second=0, microsecond=0)
    ExpenseFactory(user_id=spender.id, amount=4000.0, date=now,
                   transaction_type='income')
    ExpenseFactory(user_id=spender.id, amount=250.0, date=now,
                   transaction_type='expense')
    AccountFactory(user_id=spender.id, balance=5000.0, type='checking')
    return now


def _dashboard(client, auth_headers, user):
    resp = client.get(ENDPOINT, headers=auth_headers(user, password='secret'))
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()['data']


def test_expense_figures_are_the_callers_own_share(client, auth_headers, seeded,
                                                   bystander):
    """The bystander's expense totals stay at zero. Label: "yours"."""
    data = _dashboard(client, auth_headers, bystander)

    assert data['total_expenses_only'] == pytest.approx(0.0, abs=0.01)
    assert data['current_month_expenses_only'] == pytest.approx(0.0, abs=0.01)
    assert data['current_month_total'] == pytest.approx(0.0, abs=0.01)


def test_net_worth_covers_only_the_callers_own_accounts(client, auth_headers,
                                                        seeded, bystander,
                                                        spender):
    """`calculate_asset_debt_trends` filters by `user_id`. Label: "yours".

    Note this is the same figure the Accounts screen shows, computed over a
    different set of rows: `GET /accounts` is household-scoped, so summing the
    accounts it lists gives the household's net worth. Two screens, one label,
    two correct numbers — which is why both have to say whose they are.
    """
    assert _dashboard(client, auth_headers, bystander)['total_assets'] == pytest.approx(0.0, abs=0.01)
    assert _dashboard(client, auth_headers, spender)['total_assets'] == pytest.approx(5000.0, abs=0.01)


def test_the_expenses_list_is_the_whole_household(client, auth_headers, seeded,
                                                  bystander):
    """The bystander is shown rows they do not own. Label: "household"."""
    data = _dashboard(client, auth_headers, bystander)

    assert len(data['expenses']) == 2, 'expected the household query to return the spender\'s rows'
    assert {e['amount'] for e in data['expenses']} == {4000.0, 250.0}


def test_income_is_the_whole_household_not_the_callers_share(client, auth_headers,
                                                             seeded, bystander):
    """The asymmetry the one-line summary in AUDIT.md misses.

    The expense loop takes the caller's split share; the income loop does not
    filter at all. If this ever starts returning 0 for the bystander, income has
    become user-scoped and the "household" label on the income cards is wrong.
    """
    data = _dashboard(client, auth_headers, bystander)

    assert data['total_income'] == pytest.approx(4000.0, abs=0.01)
    assert data['current_month_income'] == pytest.approx(4000.0, abs=0.01)


def test_net_cash_flow_and_savings_rate_mix_the_two_scopes(client, auth_headers,
                                                            seeded, bystander):
    """AUDIT.md D-18: these two have no honest single-owner label.

    `net_cash_flow = total_income - total_expenses_only` subtracts the caller's
    share from the household's income. For a member who has entered nothing that
    is the household's entire income as their surplus, and a 100% savings rate.
    Labelling cannot fix a figure whose two terms have different owners; it needs
    an owner decision about which scope the metric should use.
    """
    data = _dashboard(client, auth_headers, bystander)

    assert data['net_cash_flow'] == pytest.approx(4000.0, abs=0.01)
    assert data['savings_rate'] == pytest.approx(100.0, abs=0.01)
