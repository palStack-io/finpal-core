"""split_with must match user ids exactly, not as substrings.

User ids in finPal are email addresses stored in a comma-separated `split_with`
column. Filtering with LIKE '%user_id%' matches any id that merely *contains*
the caller's id — so `a@b.com` sees expenses shared only with `aa@b.com`. That is
cross-user financial data exposure. (S-06.)

**The HTTP tests here were re-pointed on 2026-08-06, and that is the whole lesson
of this file's second edition.** They used to probe `/api/v1/transactions`, because
that endpoint's base query was `user_id == me OR split_with contains me`. D-18 items
B+D took `split_with` out of attribution entirely — a row now belongs to whoever owns
its account — so the transactions list stopped calling `split_with_filter` at all.
Left alone, one of these tests would have failed and the other would have **passed
for the wrong reason**: a genuine participant still saw the expense, but through
household scope rather than through split membership. A guard keyed to a surface goes
quiet exactly when that surface changes.

The helper did not die, it moved: `split_with_filter` still has eight call sites
(`utils/helpers.py`, `transaction/service.py`, `recurring/service.py` and four in
`analytics/service.py`). `RecurringService.get_all_recurring` is the one that is
still reachable over HTTP and still per-user, so the leak tests now go through
`/api/v1/recurring/`. `test_the_shared_filter_matches_only_whole_ids` is keyed to
the helper's compiled SQL rather than to any endpoint, which is why it needed no
change at all — the mechanism-keyed test outlived both surfaces.

The original routing hazard is kept on the record: `api/v1/transactions.py` once had
a correct filter that never ran, because the web UI calls `/api/v1/transactions`
without a trailing slash and Werkzeug routed that to an older blueprint. That
blueprint is retired and `strict_slashes = False` now, so the hazard is history
rather than a live risk — but it is why these tests go through a URL.
"""
from datetime import datetime

from src.extensions import db
from src.models.recurring import RecurringExpense
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


def _shared_recurring(owner, participants):
    """The same finding on the surface that still filters by `split_with`."""
    return RecurringExpense(
        description='Private dinner', amount=90.0, card_used='',
        split_method='equal', paid_by=owner.id, user_id=owner.id,
        split_with=','.join(participants),
        frequency='monthly', start_date=datetime(2026, 7, 4), active=True,
    )


def _recurring_rows(resp):
    body = resp.get_json()
    if isinstance(body, list):
        return body
    return body.get('recurring') or body.get('recurring_expenses') or []


def test_substring_id_does_not_see_another_users_split(client, db, auth_headers):
    """The whole finding, over HTTP, on a surface that still uses the helper."""
    short, longer = _victim_and_lookalike(db)
    owner = UserFactory(id='owner@b.com')
    db.session.add(_shared_recurring(owner, [longer.id]))
    db.session.commit()

    resp = client.get('/api/v1/recurring/', headers=auth_headers(short))
    assert resp.status_code == 200

    leaked = [r for r in _recurring_rows(resp)
              if r.get('description') == 'Private dinner']
    assert not leaked, (
        f"a@b.com received an expense split only with aa@b.com: {leaked}")


def test_a_real_participant_still_sees_the_expense(client, db, auth_headers):
    """Guards against fixing the leak by breaking sharing entirely.

    On `/api/v1/recurring/` this still means what it says. On the transactions list
    it would now pass through household scope no matter what `split_with` held,
    which is why it moved with its sibling rather than being left behind looking
    green.
    """
    short, longer = _victim_and_lookalike(db)
    owner = UserFactory(id='owner2@b.com')
    db.session.add(_shared_recurring(owner, [longer.id, short.id]))
    db.session.commit()

    resp = client.get('/api/v1/recurring/', headers=auth_headers(short))
    assert resp.status_code == 200

    assert any(r.get('description') == 'Private dinner'
               for r in _recurring_rows(resp)), (
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
