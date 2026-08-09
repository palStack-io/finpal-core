"""`group_by=owner` — and the two things about it that are not obvious.

This is a FOURTH BRANCH IN AN EXISTING ENUM, which makes it look like a small
change. It is not, and both traps are the kind that return plausible numbers:

  1. **The key is the ACCOUNT's owner, not `Expense.user_id`.** Owner decision
     2026-08-06 (D-18): a row belongs to whoever owns its account, full stop.
     `split_with` settles up; it does not decide attribution. Grouping on
     `Expense.user_id` — who typed the row in — COMPILES, RETURNS PLAUSIBLE
     NUMBERS, and DISAGREES WITH THE TRANSACTIONS LIST for exactly the split
     case D-18 was opened for.
  2. **The scope had to widen**, because grouping one user's rows by owner
     returns exactly one group. That is a permission change, and the negatives
     it must not break live in `test_spending_summary_api.py` (a demo account's
     money, and a personal access token's caller-scoping — D-42 and D-50).

── WHY THE LOAD-BEARING TEST IS CROSS-SURFACE ──────────────────────────────────

Asserting "returns groups" or "returns two groups" is structural, and a
structural assertion passes the moment somebody re-widens one side. The property
worth protecting is that THE TWO SURFACES AGREE: what the by-owner summary says
Alice spent must equal what the transactions list says when filtered to Alice.
That is the only assertion that fails if either side drifts, and drift between a
list and a detail built from different scope helpers is D-43.
"""
from datetime import datetime, timedelta

from src.extensions import db as _db
from src.models.account import Account
from src.models.personal_access_token import SCOPE_READ, PersonalAccessToken
from src.models.transaction import Expense
from tests.factories import UserFactory

URL = '/api/v1/analytics/spending-summary'
LIST_URL = '/api/v1/transactions/'
WINDOW = {'start_date': '2026-03-01', 'end_date': '2026-03-31'}


def _account(owner, name):
    account = Account(name=name, type='checking', user_id=owner.id)
    _db.session.add(account)
    _db.session.flush()
    return account


def _expense(entered_by, description, amount, when, account=None, split_with=None):
    return Expense(
        description=description, amount=amount, date=when,
        user_id=entered_by.id, paid_by=entered_by.id, card_used='',
        split_method='equal', split_with=split_with,
        account_id=account.id if account else None,
        transaction_type='expense')


def _household(db):
    """Alice and Bob, one account each, and THE ROW THAT SEPARATES THE TWO KEYS.

    *** THE DISCRIMINATOR IS A ROW ENTERED BY ONE PERSON ON ANOTHER PERSON'S
    ACCOUNT. *** `Bob buys the weekly shop on Alice's card` has
    `Expense.user_id = Bob` and `Account.user_id = Alice`, so the two candidate
    grouping keys give DIFFERENT answers: by account owner it is Alice's, by
    who-typed-it-in it is Bob's. Under D-18 (owner decision, 2026-08-06) it is
    Alice's — a row belongs to whoever owns its account, full stop.

    THE FIRST VERSION OF THIS FIXTURE HAD NO SUCH ROW, and every test here
    passed with the WRONG KEY substituted in. `Alice pays and splits with Bob`
    looks like the discriminating case and is not: Alice both entered it and
    owns the account, so the two keys agree. A fixture where every row agrees
    cannot tell two implementations apart, which is a test that inspects nothing
    wearing a very convincing disguise. Caught only by sabotaging the key and
    watching the suite stay green.
    """
    alice = UserFactory()
    bob = UserFactory()
    alice_account = _account(alice, 'Alice Current')
    bob_account = _account(bob, 'Bob Current')

    _db.session.add_all([
        _expense(alice, 'Alice groceries', 30.0, datetime(2026, 3, 5), alice_account),
        # THE DISCRIMINATOR: entered by Bob, on ALICE'S account.
        _expense(bob, 'Weekly shop on Alice card', 60.0, datetime(2026, 3, 6),
                 alice_account, split_with=bob.id),
        _expense(bob, 'Bob petrol', 10.0, datetime(2026, 3, 7), bob_account),
    ])
    _db.session.commit()
    return alice, bob


def _groups(resp):
    return {g['label']: g['total'] for g in resp.get_json()['groups']}


def test_groups_by_the_accounts_owner_not_by_who_entered_the_row(
        client, db, auth_headers):
    alice, bob = _household(db)

    resp = client.get(URL, query_string={**WINDOW, 'group_by': 'owner'},
                      headers=auth_headers(alice))

    assert resp.status_code == 200
    groups = _groups(resp)
    # 30 + 60. The 60 was ENTERED BY BOB but sits on ALICE'S account, so it is
    # Alice's. Grouping on `Expense.user_id` would answer {Alice: 30, Bob: 70} —
    # plausible, internally consistent, and wrong. Splitting it 30/30 would be
    # the `split_with` reading D-18 retired.
    assert groups == {alice.name: 90.0, bob.name: 10.0}


def test_the_by_owner_totals_AGREE_WITH_THE_TRANSACTIONS_LIST(
        client, db, auth_headers):
    """The gate. Cross-surface, not structural.

    Both numbers describe "what did Alice spend in March". They are computed by
    different code over different query shapes, and until this change they
    disagreed. If either side is re-scoped, this fails; a "returns two groups"
    assertion would not.
    """
    alice, bob = _household(db)

    summary = client.get(URL, query_string={**WINDOW, 'group_by': 'owner'},
                         headers=auth_headers(alice))
    by_owner = _groups(summary)

    for member in (alice, bob):
        listed = client.get(LIST_URL, query_string={
            'start_date': '2026-03-01', 'end_date': '2026-03-31T23:59:59',
            'member_id': member.id, 'per_page': 100},
            headers=auth_headers(alice))
        assert listed.status_code == 200
        list_total = listed.get_json()['summary']['total_expense']

        assert by_owner[member.name] == list_total, (
            'the summary and the list disagree about %s: %s vs %s'
            % (member.name, by_owner[member.name], list_total))


def test_a_row_whose_account_was_deleted_falls_back_to_whoever_entered_it(
        client, db, auth_headers):
    """The orphan clause, and the test that actually separates the two keys.

    `Expense.account_id` is nullable and permanently so —
    `AccountRepository.nullify_account_on_transactions` nulls it across an
    account's whole history when the account is deleted. Those rows are
    reachable and permanent, and the OUTER join is what keeps them: an inner
    join would silently drop them rather than attribute them.

    Here the row is entered by Bob and has no account, so it is Bob's by the
    fallback. Grouping on `Account.user_id` alone would lose it entirely, which
    is a total that is quietly too small.
    """
    alice, bob = _household(db)
    _db.session.add(_expense(bob, 'Cash, account since deleted', 25.0,
                             datetime(2026, 3, 8), account=None))
    _db.session.commit()

    resp = client.get(URL, query_string={**WINDOW, 'group_by': 'owner'},
                      headers=auth_headers(alice))

    groups = _groups(resp)
    assert groups == {alice.name: 90.0, bob.name: 35.0}
    # And nothing was dropped on the way.
    assert resp.get_json()['total'] == 125.0


def test_the_total_is_the_same_however_it_is_sliced(client, db, auth_headers):
    """A summary whose total depends on the grouping is not a summary.

    This is why the scope widened for EVERY branch rather than only for `owner`.
    Widening one branch would have made this endpoint contradict itself over the
    same date range, which is a subtler bug than the one being fixed.
    """
    alice, _ = _household(db)

    totals = {}
    for grouping in ('category', 'merchant', 'month', 'owner'):
        resp = client.get(URL, query_string={**WINDOW, 'group_by': grouping},
                          headers=auth_headers(alice))
        assert resp.status_code == 200
        totals[grouping] = resp.get_json()['total']

    assert len(set(totals.values())) == 1, totals


def test_owner_is_a_documented_grouping_not_an_undocumented_one(
        client, db, auth_headers):
    """The refusal message must list it, or the enum and its error drift apart."""
    alice, _ = _household(db)
    resp = client.get(URL, query_string={**WINDOW, 'group_by': 'nonsense'},
                      headers=auth_headers(alice))
    assert resp.status_code == 400
    assert 'owner' in resp.get_json()['error']


def test_a_personal_access_token_grouping_by_owner_sees_only_itself(
        client, db, auth_headers):
    """D-50 again, on the branch most likely to tempt a widening.

    "Group my household's spending by person" is exactly what an MCP client
    would ask, and it is exactly what a token must not be able to answer.
    """
    alice, bob = _household(db)
    _, plaintext = PersonalAccessToken.generate(
        user_id=alice.id, name='mcp', scopes=SCOPE_READ,
        expires_at=datetime.utcnow() + timedelta(days=1))
    _db.session.commit()

    resp = client.get(URL, query_string={**WINDOW, 'group_by': 'owner'},
                      headers={'X-API-Key': plaintext})

    assert resp.status_code == 200
    groups = _groups(resp)
    assert groups == {alice.name: 90.0}
    assert bob.name not in resp.get_data(as_text=True)


def test_the_statement_compiles_on_postgresql_not_just_sqlite(app):
    """CI runs SQLite; the deploy runs Postgres.

    `COALESCE` over a join key and a `GROUP BY` on that expression are exactly
    the shapes that differ — Postgres rejects an ORDER BY on a column outside the
    GROUP BY, which has already bitten this file's neighbour (`_totals_for`).
    Compiling to the postgresql dialect catches that here rather than in
    production, where the only symptom is a 500.
    """
    from sqlalchemy import func
    from sqlalchemy.dialects import postgresql
    from src.models.user import User
    from src.utils.household import scope_query

    with app.app_context():
        owner_key = func.coalesce(Account.user_id, Expense.user_id)
        statement = (scope_query(['a@test.com', 'b@test.com'])
                     .filter(Expense.transaction_type == 'expense')
                     .outerjoin(User, User.id == owner_key)
                     .with_entities(
                         owner_key.label('key'),
                         func.coalesce(User.name, owner_key).label('label'),
                         func.sum(Expense.amount).label('total'),
                         func.count(Expense.id).label('count'))
                     .group_by(owner_key, User.name)
                     .statement)

        sql = str(statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={'literal_binds': True}))

    assert 'LEFT OUTER JOIN accounts' in sql
    assert 'coalesce' in sql.lower()
    assert 'GROUP BY' in sql
    # The ORDER BY trap: nothing may order by a column outside the GROUP BY.
    assert 'ORDER BY' not in sql
