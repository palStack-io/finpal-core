"""split_with must match user ids exactly, not as substrings.

User ids in finPal are email addresses stored in a comma-separated `split_with`
column. Filtering with LIKE '%user_id%' matches any id that merely *contains*
the caller's id — so `a@b.com` sees expenses shared only with `aa@b.com`. That is
cross-user financial data exposure.

`api/v1/transactions.py` had a correct filter, but the web UI calls
`/api/v1/transactions` with no trailing slash, which Werkzeug routes to the older
`transaction_api` blueprint instead — so the fix never ran on the path real
browsers use. These tests go through the URL, not the helper, so they fail if the
routing shadows the fix again.
"""
from datetime import datetime

from src.extensions import db
from src.models.transaction import Expense
from tests.factories import UserFactory


def _victim_and_lookalike(db):
    """`a@b.com` is a strict substring of `aa@b.com`."""
    short = UserFactory(id='a@b.com')
    longer = UserFactory(id='aa@b.com')
    db.session.commit()
    return short, longer


def _shared_expense(owner, participants):
    return Expense(
        description='Private dinner', amount=90.0, date=datetime(2026, 7, 4),
        user_id=owner.id, paid_by=owner.id, card_used='', split_method='equal',
        split_with=','.join(participants),
    )


def test_substring_id_does_not_see_another_users_split(client, db, auth_headers):
    """The whole finding, over HTTP, on the path the web UI actually uses."""
    short, longer = _victim_and_lookalike(db)
    owner = UserFactory(id='owner@b.com')
    db.session.add(_shared_expense(owner, [longer.id]))
    db.session.commit()

    resp = client.get('/api/v1/transactions', headers=auth_headers(short))
    assert resp.status_code == 200

    body = resp.get_json()
    rows = body if isinstance(body, list) else (
        body.get('transactions') or body.get('expenses') or [])
    leaked = [r for r in rows if r.get('description') == 'Private dinner']
    assert not leaked, (
        f"a@b.com received an expense split only with aa@b.com: {leaked}")


def test_a_real_participant_still_sees_the_expense(client, db, auth_headers):
    """Guards against fixing the leak by breaking sharing entirely."""
    short, longer = _victim_and_lookalike(db)
    owner = UserFactory(id='owner2@b.com')
    db.session.add(_shared_expense(owner, [longer.id, short.id]))
    db.session.commit()

    resp = client.get('/api/v1/transactions', headers=auth_headers(short))
    assert resp.status_code == 200

    body = resp.get_json()
    rows = body if isinstance(body, list) else (
        body.get('transactions') or body.get('expenses') or [])
    assert any(r.get('description') == 'Private dinner' for r in rows), (
        'a genuine participant lost access to a shared expense')


def test_the_shared_filter_matches_only_whole_ids():
    """Unit-level cover for every position in the comma-separated list."""
    from src.utils.split_with import split_with_filter

    clause = split_with_filter(Expense.split_with, 'a@b.com')
    compiled = str(clause.compile(compile_kwargs={'literal_binds': True}))
    # A bare %a@b.com% would match anywhere; the fixed form anchors on commas.
    assert "'%a@b.com%'" not in compiled
    for expected in ("'a@b.com'", "'a@b.com,%'", "'%,a@b.com,%'", "'%,a@b.com'"):
        assert expected in compiled, f'missing {expected} in {compiled}'
