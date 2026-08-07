"""Which scope each `/analytics/dashboard` field carries — the before/after record.

**THE MIX IS GONE. This file now characterises its absence, and that is the point
of keeping it rather than deleting it.** It was written to pin the old behaviour so
the UI's per-figure labels had something true to be written against; D-18 item E
made every figure describe the same people, so the labels it justified are retired
on the dashboard and these tests assert the new answer. Renaming the tests and
inverting the assertions is deliberate — the git history of this one file is the
clearest statement of what item E actually changed.

WHAT IT USED TO SAY, kept because the shape recurs:

    net_worth / total_assets / total_debts   the caller's own accounts
    total_expenses* / current_month_total    the caller's *share* of splits
    total_income / current_month_income      every income row in the household
    expenses / top_categories / monthly_*    every expense row in the household

The income asymmetry was the one that was easy to miss: the income loop in
`AnalyticsService.get_dashboard_data` summed `expense.amount` over the household
query with no split share and no user filter, while the expense loop a few lines
below took `user_share`. So `net_cash_flow` and `savings_rate` subtracted a
caller-scoped figure from a household-scoped one, and a member who had entered
nothing saw the household's entire income as their surplus and a **100% savings
rate**. That is what D-18 was opened for.

WHAT IT SAYS NOW: every figure is the household by default and follows `member_id`
together. Attribution is the account's owner, via the same `owner_scope_filter` the
transactions list uses, so the list and the totals cannot disagree. The scope is no
longer a caption the user has to read — it is an answer they chose.

`test_analytics_scope_contract.py` is the oracle for the change itself: the demo
sandbox, the PAT rule, the 403, and the filter. This file stays deliberately narrow
— it is about which fields carry which scope, nothing else.

The other half of the pair is `mobile/src/utils/scope.ts` and
`web-ui/src/utils/scope.ts`, whose dashboard entries went with it. Nothing but
these files connects "what the backend does" to "what the screen claims", so if
the scoping changes again, change the labels there — and keep the docstrings
pointing at each other.
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


def test_expense_figures_now_cover_the_household(client, auth_headers, seeded,
                                                 bystander):
    """WAS: the bystander's expense totals stayed at zero, labelled "yours".

    NOW: they are the household's, like the income figures they are subtracted
    from. This is the assertion that flipped, and it is the whole of item E in one
    number.
    """
    data = _dashboard(client, auth_headers, bystander)

    assert data['total_expenses_only'] == pytest.approx(250.0, abs=0.01)
    assert data['current_month_expenses_only'] == pytest.approx(250.0, abs=0.01)
    assert data['current_month_total'] == pytest.approx(250.0, abs=0.01)


def test_net_worth_now_covers_the_household_like_everything_else(
        client, auth_headers, seeded, bystander, spender):
    """WAS: `calculate_asset_debt_trends` filtered to the caller. Label: "yours".

    NOW: it takes the same scope as the rest of the payload, so the two members
    see the same household total and `member_id` narrows it for both.

    The old docstring recorded the contradiction this removes: `GET /accounts` is
    household-scoped, so summing the accounts that screen LISTS already gave the
    household's net worth while the dashboard's own figure gave the caller's.
    Two screens, one label, two different correct numbers. Now there is one.
    """
    assert _dashboard(client, auth_headers, bystander)['total_assets'] == pytest.approx(5000.0, abs=0.01)
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


def test_net_cash_flow_and_savings_rate_no_longer_mix_two_scopes(
        client, auth_headers, seeded, bystander):
    """**AUDIT.md D-18, the symptom the row was opened for.**

    WAS: `net_cash_flow = total_income - total_expenses_only` subtracted the
    caller's split share from the household's income, so the bystander — who has
    entered nothing — saw the household's entire 4000 as their surplus and a
    **100% savings rate**. There was no honest single-owner label for it, which is
    what made this an owner decision rather than a copy change.

    NOW: both terms are the household's. 4000 income less 250 of expenses is 3750,
    and 93.75% is a number about the household that says so.
    """
    data = _dashboard(client, auth_headers, bystander)

    assert data['net_cash_flow'] == pytest.approx(3750.0, abs=0.01)
    assert data['savings_rate'] == pytest.approx(93.75, abs=0.01)
