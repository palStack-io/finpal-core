"""`same_side_user_ids` is the SET form of `on_the_same_side`. They must agree.

Two definitions of one rule is what D-18 was opened to remove. This one is
unavoidable -- a list endpoint needs an `IN (...)`, and a pairwise Python
predicate cannot be one -- so the duplication is made safe by proving they match
rather than by trusting that they do.

*** THE LAST TEST IS THE ONE THAT WOULD HAVE CAUGHT THE REAL BUG. ***
`User.is_demo_user` is NULLABLE with a PYTHON-side default, so a row written by
anything other than the ORM holds NULL. `bool(None)` is False in Python, but
`is_demo_user == False` matches NOTHING in SQL. A set built with `== False` would
silently drop every such user from the household side -- and the ORM cannot
create that row, so it has to be written with raw SQL (D-155).
"""
import pytest
from sqlalchemy import text

from src.extensions import db as _db
from src.utils.household import on_the_same_side, same_side_user_ids
from tests.factories import UserFactory


def test_the_set_and_the_pair_agree_across_the_boundary(db):
    real_a = UserFactory(id='ra@test.com')
    real_b = UserFactory(id='rb@test.com')
    demo_a = UserFactory(id='da@finpal.app', is_demo_user=True)
    demo_b = UserFactory(id='db@finpal.app', is_demo_user=True)
    everyone = [real_a.id, real_b.id, demo_a.id, demo_b.id]

    for caller in everyone:
        allowed = set(same_side_user_ids(caller))
        for other in everyone:
            assert (other in allowed) == on_the_same_side(caller, other), (
                f'{caller} vs {other}: set says {other in allowed}, '
                f'pair says {on_the_same_side(caller, other)}'
            )


@pytest.mark.parametrize('caller', ['', None, 'nobody@test.com'])
def test_an_id_with_no_side_matches_nobody(db, caller):
    """An id that is not on the instance has no side, exactly as the pairwise
    predicate says -- not "everyone", which is how an empty check becomes a leak."""
    UserFactory(id='someone@test.com')
    assert same_side_user_ids(caller) == []


def test_a_NULL_is_demo_user_is_on_the_HOUSEHOLD_side_in_both_forms(db):
    """The row the ORM cannot make, written with raw SQL.

    `is_demo_user` is nullable with a Python-side default, so the ORM fills in
    False and an ORM-built "NULL" asserts nothing (D-155). A seed script, a
    backfill or `psql` produces the real thing.
    """
    real = UserFactory(id='real@test.com')
    _db.session.execute(text(
        "INSERT INTO users (id, name, password_hash, is_demo_user) "
        "VALUES ('legacy@test.com', 'Legacy', 'x', NULL)"))
    _db.session.commit()

    assert _db.session.execute(text(
        "SELECT is_demo_user FROM users WHERE id = 'legacy@test.com'"
    )).scalar() is None, 'the NULL did not survive the insert'

    assert on_the_same_side(real.id, 'legacy@test.com') is True
    assert 'legacy@test.com' in same_side_user_ids(real.id)
    assert real.id in same_side_user_ids('legacy@test.com')
