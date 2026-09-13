"""`/api/v1/review` over HTTP — and the two refusals that must not look alike.

*** THE SERVICE'S TESTS DO NOT COVER THIS FILE. *** `test_review_page.py` proves
the permission rules; what can still be wrong here is the TRANSLATION — a 403
flattened to a 200, a count the client has to derive, a route registered under a
path nothing calls. A service with no reachable caller is D-187, and this
repository has shipped that exact shape twice.

So every assertion below reads the body as well as the status. Every bug found
across eight sessions of this project returned 200 and rendered fine.
"""
import pytest

from src.extensions import db
from src.models.account import Account
from src.models.category import Category
from src.services.review.service import INFERRED, USER
from tests.factories import (AccountFactory, CategoryFactory, ExpenseFactory,
                             UserFactory)


@pytest.fixture
def bob(db):
    return UserFactory(id='bob@reviewapi.test', name='Bob', is_admin=False,
                       password_plain='pw-bob')


@pytest.fixture
def alice(db):
    return UserFactory(id='alice@reviewapi.test', name='Alice', is_admin=False,
                       password_plain='pw-alice')


@pytest.fixture
def bob_h(client, auth_headers, bob):
    return auth_headers(bob, password='pw-bob')


@pytest.fixture
def alice_h(client, auth_headers, alice):
    return auth_headers(alice, password='pw-alice')


def _guessed_category(owner, name='Gym'):
    return CategoryFactory(user_id=owner.id, name=name, spending_type='fixed',
                           spending_type_source=INFERRED)


def _inferred_account(owner, name='Everyday'):
    return AccountFactory(user_id=owner.id, name=name, type='checking',
                          type_source=INFERRED)


# ===========================================================================
# The route exists, is reachable, and is closed to anonymous callers
# ===========================================================================

def test_the_route_is_registered_and_answers(client, bob_h, bob):
    """D-187: a namespace nobody registered is a 404 no test would notice."""
    _guessed_category(bob)

    res = client.get('/api/v1/review', headers=bob_h)

    assert res.status_code == 200
    assert res.get_json()['counts']['categories'] == 1


def test_review_requires_a_token(client, bob):
    _guessed_category(bob)

    res = client.get('/api/v1/review')

    assert res.status_code == 401


def test_confirming_requires_a_token(client, bob):
    category = _guessed_category(bob)

    res = client.post(f'/api/v1/review/categories/{category.id}/confirm')

    assert res.status_code == 401
    assert db.session.get(Category, category.id).spending_type_source == INFERRED


# ===========================================================================
# The GET carries the whole page
# ===========================================================================

def test_the_get_carries_three_sections_and_their_verbs(client, bob_h, bob):
    _guessed_category(bob)
    _inferred_account(bob)
    ExpenseFactory(user_id=bob.id, category_id=None, description='Corner shop')

    body = client.get('/api/v1/review', headers=bob_h).get_json()

    assert {n: s['action'] for n, s in body['sections'].items()} == {
        'categories': 'confirm', 'accounts': 'confirm', 'uncategorised': 'choose'}
    assert body['total'] == 3


def test_the_wire_format_carries_no_denominator(client, bob_h, bob):
    """Not just the service's return value — what actually crosses the wire.

    A page size added by a serializer, a paginator wrapper or a helpful `meta`
    block would reintroduce "showing 50 of 237" without touching the service.
    """
    _guessed_category(bob)

    body = client.get('/api/v1/review', headers=bob_h).get_json()

    assert 'limit' not in body
    assert set(body) == {'total', 'counts', 'sections'}


# ===========================================================================
# *** THE TWO REFUSALS GET TWO ANSWERS ***
# ===========================================================================

def test_confirming_someone_elses_account_is_403_with_a_reason(
        client, alice_h, alice, bob):
    """*** THE POINT OF THE WHOLE ERROR TYPE. ***

    Reads stay household-wide, so the page SHOWS Alice this account — see the
    test below, which pins that. A 200 here would mean she clicks Confirm, the
    row stays put, and nothing on screen says why.
    """
    account = _inferred_account(bob, name='Bobs Current')

    res = client.post(f'/api/v1/review/accounts/{account.id}/confirm',
                      headers=alice_h)

    assert res.status_code == 403
    assert 'error' in res.get_json(), 'web-ui reads data.error, not data.message'
    assert db.session.get(Account, account.id).type_source == INFERRED


def test_the_page_still_shows_alice_the_account_she_cannot_confirm(
        client, alice_h, bob):
    """The pair that makes the 403 necessary rather than incidental (D-43)."""
    _inferred_account(bob, name='Bobs Current')

    body = client.get('/api/v1/review', headers=alice_h).get_json()

    assert 'Bobs Current' in [r['name'] for r in body['sections']['accounts']['rows']]


def test_a_second_click_is_200_and_not_an_error(client, bob_h, bob):
    """Two tabs open. Not a failure, and must not be dressed as one."""
    account = _inferred_account(bob)

    first = client.post(f'/api/v1/review/accounts/{account.id}/confirm',
                        headers=bob_h)
    second = client.post(f'/api/v1/review/accounts/{account.id}/confirm',
                         headers=bob_h)

    assert first.status_code == 200 and first.get_json()['changed'] is True
    assert second.status_code == 200 and second.get_json()['changed'] is False


def test_the_refusal_and_the_no_op_do_not_share_a_status(
        client, alice_h, alice, bob):
    """Asserted as one comparison, because the defect is that they MATCH."""
    mine = _inferred_account(alice, name='Mine')
    theirs = _inferred_account(bob, name='Theirs')
    client.post(f'/api/v1/review/accounts/{mine.id}/confirm', headers=alice_h)

    no_op = client.post(f'/api/v1/review/accounts/{mine.id}/confirm',
                        headers=alice_h)
    refused = client.post(f'/api/v1/review/accounts/{theirs.id}/confirm',
                          headers=alice_h)

    assert no_op.status_code != refused.status_code
    assert (no_op.status_code, refused.status_code) == (200, 403)


# ===========================================================================
# A confirm answers with the server's counts, so the client never derives one
# ===========================================================================

def test_a_confirm_answers_with_the_refreshed_page(client, bob_h, bob):
    """D-101: the server owns the totals.

    A `{'success': true}` reply would leave the client decrementing its own
    badge, which is the shape where two views of the same household disagree
    about how much is left to do.
    """
    category = _guessed_category(bob)
    _inferred_account(bob)

    body = client.post(f'/api/v1/review/categories/{category.id}/confirm',
                       headers=bob_h).get_json()

    assert body['changed'] is True
    assert body['counts'] == {'categories': 0, 'accounts': 1, 'uncategorised': 0}
    assert body['total'] == 1
    assert db.session.get(Category, category.id).spending_type_source == USER


def test_a_housemate_may_confirm_a_category_over_http(client, alice_h, bob):
    """The opposite rule from accounts, one path away — pinned at the edge too.

    Categories are household property with no owner (D-20). The service test
    proves the predicate; this proves the route did not add an owner check of
    its own on the way past.
    """
    category = _guessed_category(bob)

    res = client.post(f'/api/v1/review/categories/{category.id}/confirm',
                      headers=alice_h)

    assert res.status_code == 200
    assert res.get_json()['changed'] is True
    assert db.session.get(Category, category.id).spending_type_source == USER
