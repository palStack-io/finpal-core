"""Whose money `/analytics/dashboard` describes — D-18 item E.

THE ORACLE FOR ITEM E, and the reason D-18 was opened in the first place.

`net_cash_flow = total_income - total_expenses_only` subtracted a **caller-scoped**
figure from a **household-scoped** one: the income loop summed `expense.amount`
over every household row, while the expense loop a few lines below took only the
caller's split share. A member who had entered nothing therefore saw the whole
household's income as their surplus and a **100% savings rate**. Labelling could
describe that; it could not make it true, which is why D-01's per-figure tags were
always a holding position and this is the pass that retires them on the dashboard.

THREE CHANGES, PINNED SEPARATELY ON PURPOSE, because the first two are not D-18
and would otherwise hide inside it:

1.  **The base scope was `get_all_user_ids()` — every user on the instance, with
    no `is_demo_user` filter at all.** Demo accounts ship with a published
    password, so on any instance running the demo seed a demo login's dashboard
    covered the real household's money and vice versa. That is **D-42's hole, one
    service over**, and it had survived because nothing in analytics had a scope
    decision written down to check against. Narrowed to `read_scope`, which also
    brings **D-50** with it: a personal access token stays caller-scoped, because
    `AgentAccess.tsx` promises "A token reads only your own data" and widening
    reads to the household would otherwise have widened them for tokens too, as a
    side effect rather than a decision.

2.  **Four analytics queries still attributed rows by `split_with`.** Owner
    decision 2026-08-06: a row belongs to whoever owns its **account**, full stop.
    #76 re-keyed the transactions list and left analytics alone, so the list and
    the dashboard could disagree about the same rows. They now share one
    predicate — `owner_scope_filter`, promoted to `src/utils/household.py` for
    exactly that reason. A second copy inside the analytics service is what would
    let them drift again.

3.  **`member_id`**, which is item E proper. Every figure follows it, which is the
    whole argument for a filter over a tag: the scope becomes one answer the user
    chose rather than a per-figure caption they have to read. An id outside the
    caller's scope is **403, never an empty list** — an empty list is
    indistinguishable from "that member has nothing".

SCOPE OF THIS PASS, decided with the owner and stated so the next reader does not
think it was missed: `member_id` lands on `/analytics/dashboard` only. The
Dashboard page renders that endpoint and nothing else from the analytics family;
the seven other endpoints belong to the separate Analytics page, which keeps its
scope tags and has its own AUDIT row. The boundary is a **page**, so no page ends
up half-filtered — which is precisely the D-51 mistake this avoids.

Read `test_dashboard_scope_mix.py` alongside this: it is the before/after record,
rewritten in this pass to characterise the new, uniform scoping rather than the
old mix.
"""

from datetime import datetime

import pytest

from tests.factories import AccountFactory, ExpenseFactory, UserFactory

ENDPOINT = '/api/v1/analytics/dashboard'


# ---------------------------------------------------------------------------
# Fixtures — a household of two, plus a demo account that is on the instance
# but is NOT a household member.
# ---------------------------------------------------------------------------

@pytest.fixture
def alice(db):
    return UserFactory(id='alice@test.com', name='Alice', password_plain='pw-alice')


@pytest.fixture
def bob(db):
    return UserFactory(id='bob@test.com', name='Bob', password_plain='pw-bob')


@pytest.fixture
def demo_user(db):
    return UserFactory(id='demo1@finpal.demo', name='Demo',
                       is_demo_user=True, password_plain='pw-demo')


@pytest.fixture
def alice_h(client, auth_headers, alice):
    return auth_headers(alice, password='pw-alice')


@pytest.fixture
def bob_h(client, auth_headers, bob):
    return auth_headers(bob, password='pw-bob')


@pytest.fixture
def demo_h(client, auth_headers, demo_user):
    return auth_headers(demo_user, password='pw-demo')


def _now():
    """Mid-month, mid-day: the dashboard buckets by month and by current month."""
    return datetime.utcnow().replace(day=15, hour=12, minute=0, second=0,
                                     microsecond=0)


def _row(owner, entered_by=None, **kw):
    """A transaction on `owner`'s account, entered by `entered_by` (default owner).

    Separable on purpose: `account.user_id` is whose money it is, `Expense.user_id`
    is who typed it in.
    """
    account = kw.pop('account', None) or AccountFactory(user_id=owner.id)
    kw.setdefault('date', _now())
    return ExpenseFactory(user_id=(entered_by or owner).id,
                          account_id=account.id, **kw)


def _dash(client, headers, **params):
    qs = '&'.join(f'{k}={v}' for k, v in params.items())
    return client.get(f'{ENDPOINT}?{qs}' if qs else ENDPOINT, headers=headers)


def _data(client, headers, **params):
    resp = _dash(client, headers, **params)
    assert resp.status_code == 200, resp.get_json()
    return resp.get_json()['data']


# ===========================================================================
# PINS — true before this change and required to stay true
# ===========================================================================

def test_pin_the_dashboard_still_answers_with_its_whole_shape(client, alice_h, alice):
    """A scope change must not quietly drop fields the UI reads.

    Keyed to the fields the two dashboards actually render rather than to the
    whole payload, so adding a field is not a failure but losing one is.
    """
    _row(alice, amount=250.0, transaction_type='expense')
    data = _data(client, alice_h)

    # `expenses`, NOT `recent_transactions` — the server sends the year-to-date
    # list and mobile's `analyticsService` slices its own `recent_transactions`
    # out of it client-side. Written the other way round first, and this pin
    # caught it: a payload-shape assertion is worth nothing if it names fields the
    # payload never had.
    for field in ('total_income', 'total_expenses_only', 'net_cash_flow',
                  'savings_rate', 'net_worth', 'total_assets', 'total_debts',
                  'expenses', 'top_categories', 'current_month_income',
                  'current_month_expenses_only'):
        assert field in data, f'{field} disappeared from the dashboard payload'


def test_pin_transfers_are_still_excluded_from_both_totals(client, alice_h, alice):
    """A transfer moves money without earning or spending it.

    This is the arithmetic most at risk from re-pointing the query, and it is the
    one a scope test would otherwise never look at.
    """
    _row(alice, amount=4000.0, transaction_type='income')
    _row(alice, amount=250.0, transaction_type='expense')
    _row(alice, amount=900.0, transaction_type='transfer')

    data = _data(client, alice_h)

    assert data['total_income'] == pytest.approx(4000.0)
    assert data['total_expenses_only'] == pytest.approx(250.0)


def test_pin_savings_rate_is_zero_rather_than_undefined_without_income(
        client, alice_h, alice):
    _row(alice, amount=250.0, transaction_type='expense')

    assert _data(client, alice_h)['savings_rate'] == 0


def test_pin_a_row_the_caller_entered_on_their_own_account_is_still_theirs(
        client, alice_h, alice):
    _row(alice, amount=250.0, transaction_type='expense')

    assert _data(client, alice_h)['total_expenses_only'] == pytest.approx(250.0)


# ===========================================================================
# FIX 1 — the base scope stops covering every user on the instance
# ===========================================================================

def test_fix_a_demo_caller_does_not_see_the_households_money(
        client, demo_h, demo_user, alice):
    """D-42, one service over.

    `get_all_user_ids()` has no `is_demo_user` filter, so a demo login — whose
    password is published — got the real household's income and expenses on its
    dashboard. Watched answering with Alice's 4000 before the fix.
    """
    _row(alice, amount=4000.0, transaction_type='income')
    _row(alice, amount=250.0, transaction_type='expense')

    data = _data(client, demo_h)

    assert data['total_income'] == 0
    assert data['total_expenses_only'] == 0


def test_fix_the_household_does_not_see_a_demo_accounts_money(
        client, alice_h, alice, demo_user):
    """The sandbox has to hold in both directions or it is not a sandbox."""
    _row(demo_user, amount=999.0, transaction_type='income')

    assert _data(client, alice_h)['total_income'] == 0


def test_fix_a_personal_access_token_stays_caller_scoped(client, db, alice, bob):
    """D-50, and there is still no other gate for it.

    `/analytics/dashboard` is `@jwt_required()` only, so no token reaches it —
    but **`/analytics/networth` is PAT-wired** (`test_pat_read_access.py`) and it
    is built by calling `get_dashboard_data`. So widening that one function
    widens a long-lived credential surface unless `g.pat` stops it, silently and
    as a side effect rather than as a decision. `AgentAccess.tsx:386` promises the
    user in as many words: *"A token reads only your own data."*

    This is the pin the standing rule has been waiting for. It is keyed to the
    figure a token can actually read, not to `g.pat` being consulted somewhere.
    """
    from datetime import timedelta

    from src.models.personal_access_token import SCOPE_READ, PersonalAccessToken

    alice_account = AccountFactory(user_id=alice.id, balance=5000.0, type='checking')
    bob_account = AccountFactory(user_id=bob.id, balance=2000.0, type='checking')
    # The trend only emits months that contain transactions, so without these the
    # series is empty and the assertion would inspect nothing. Put them ON the
    # accounts above — letting `_row` mint its own would add a second account per
    # user and quietly change the very total being asserted (it did: 6000).
    _row(alice, account=alice_account, amount=10.0, transaction_type='expense')
    _row(bob, account=bob_account, amount=10.0, transaction_type='expense')
    _, plaintext = PersonalAccessToken.generate(
        user_id=alice.id, name='reader', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    db.session.commit()

    resp = client.get('/api/v1/analytics/networth', headers={'X-API-Key': plaintext})

    assert resp.status_code == 200, resp.get_json()
    series = resp.get_json()['networth']
    assert series, 'no series to check the scope of — the assertion would be vacuous'
    # Alice's 5000 alone, never Alice's + Bob's 7000.
    assert series[-1]['assets'] == pytest.approx(5000.0)


# ===========================================================================
# FIX 2 — attribution comes from the account, not from `split_with`
# ===========================================================================

def test_fix_attribution_comes_from_the_account_not_split_with(
        client, bob_h, alice, bob):
    """Alice paid on Alice's account and split it with Bob. It is Alice's row.

    Bob's share is a settlement matter. Before this, `split_with_filter` pulled
    the row into Bob's dashboard as though he owned it — the same predicate #76
    retired on the transactions list and left here.
    """
    _row(alice, amount=300.0, transaction_type='expense', split_with=bob.id)

    data = _data(client, bob_h, member_id=bob.id)

    assert data['total_expenses_only'] == 0


def test_fix_an_orphaned_row_is_attributed_to_whoever_entered_it(
        client, alice_h, alice):
    """`account_id` is nullable and deleting an account nulls it across that
    account's whole history, so account-less rows are reachable and permanent.

    An inner join would drop them silently, which is worse than misattributing
    them because nothing on screen would be wrong — the money would simply be
    gone.
    """
    ExpenseFactory(user_id=alice.id, account_id=None, amount=120.0,
                   date=_now(), transaction_type='expense')

    assert _data(client, alice_h)['total_expenses_only'] == pytest.approx(120.0)


# ===========================================================================
# FIX 3 — D-18 proper: the two halves of net_cash_flow finally agree
# ===========================================================================

def test_fix_income_and_expenses_now_describe_the_same_people(
        client, bob_h, alice, bob):
    """**This is D-18's symptom, and the assertion the row was opened for.**

    Bob has entered nothing. Before: `total_income` was the household's 4000 and
    `total_expenses_only` was Bob's share of it — 0 — so `net_cash_flow` was 4000
    and `savings_rate` was **100%** for a member with no activity at all.
    """
    _row(alice, amount=4000.0, transaction_type='income')
    _row(alice, amount=1000.0, transaction_type='expense')

    data = _data(client, bob_h)

    assert data['total_income'] == pytest.approx(4000.0)
    assert data['total_expenses_only'] == pytest.approx(1000.0)
    assert data['net_cash_flow'] == pytest.approx(3000.0)
    assert data['savings_rate'] == pytest.approx(75.0)


def test_fix_a_member_who_entered_nothing_no_longer_shows_a_100_percent_rate(
        client, bob_h, alice, bob):
    """The same defect stated the way a user would notice it."""
    _row(alice, amount=4000.0, transaction_type='income')
    _row(alice, amount=4000.0, transaction_type='expense')

    assert _data(client, bob_h)['savings_rate'] == pytest.approx(0.0)


# ===========================================================================
# FIX 4 — the member filter, and what it must refuse
# ===========================================================================

def test_fix_the_member_filter_narrows_every_figure_together(
        client, alice_h, alice, bob):
    """Every figure or none. A filter that moved some of them would be D-51 again."""
    _row(alice, amount=4000.0, transaction_type='income')
    _row(alice, amount=1000.0, transaction_type='expense')
    _row(bob, amount=500.0, transaction_type='income')
    _row(bob, amount=100.0, transaction_type='expense')

    everyone = _data(client, alice_h)
    just_bob = _data(client, alice_h, member_id=bob.id)

    assert everyone['total_income'] == pytest.approx(4500.0)
    assert everyone['total_expenses_only'] == pytest.approx(1100.0)
    assert just_bob['total_income'] == pytest.approx(500.0)
    assert just_bob['total_expenses_only'] == pytest.approx(100.0)
    assert just_bob['net_cash_flow'] == pytest.approx(400.0)


def test_fix_net_worth_follows_the_member_filter_too(client, alice_h, alice, bob):
    """Net worth was the caller's own accounts regardless of everything else.

    Under the settled model accounts are household property assigned to a member,
    and reads are household-wide — so the default is the household and the filter
    narrows it, exactly like every other figure. Leaving net worth caller-scoped
    while the totals moved is what would make the control lie.
    """
    AccountFactory(user_id=alice.id, balance=5000.0, type='checking')
    AccountFactory(user_id=bob.id, balance=2000.0, type='checking')

    assert _data(client, alice_h)['total_assets'] == pytest.approx(7000.0)
    assert _data(client, alice_h, member_id=bob.id)['total_assets'] == pytest.approx(2000.0)


def test_fix_the_member_filter_refuses_an_id_outside_the_household(client, alice_h, alice):
    """403, not an empty dashboard.

    A dashboard of zeroes is indistinguishable from a member who has nothing, so
    silently honouring an id the server rejects would make the control lie in the
    quietest possible way.
    """
    assert _dash(client, alice_h, member_id='nobody@example.com').status_code == 403


def test_fix_the_member_filter_cannot_reach_a_demo_account(
        client, alice_h, alice, demo_user):
    """The sandbox is not addressable through the new parameter either."""
    _row(demo_user, amount=999.0, transaction_type='income')

    assert _dash(client, alice_h, member_id=demo_user.id).status_code == 403


def test_fix_a_demo_caller_cannot_filter_to_a_real_member(
        client, demo_h, demo_user, alice):
    """`read_scope` collapses to the caller for a demo account, so a real member's
    id is outside it and the refusal falls out of the same rule rather than
    needing a second one."""
    assert _dash(client, demo_h, member_id=alice.id).status_code == 403


def test_fix_filtering_to_yourself_is_allowed_and_is_not_the_whole_household(
        client, alice_h, alice, bob):
    """The inverse case. Without it, "refuse everything" would pass every test
    above."""
    _row(alice, amount=4000.0, transaction_type='income')
    _row(bob, amount=500.0, transaction_type='income')

    assert _data(client, alice_h, member_id=alice.id)['total_income'] == pytest.approx(4000.0)
