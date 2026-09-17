"""The coins API.

*** THE ASSERTION THAT MATTERS MOST IS AN ABSENCE: NO DENOMINATOR ON THE WIRE.
*** No ceiling, no total, no coverage fraction — a client that receives any of
them can render "14 of 35", which is the one thing decision 5 forbids. The
Review page kept `SECTION_LIMIT` off its payload for the same reason.
"""

import datetime
import json

import pytest

from src.extensions import db as _db
from src.models.coins import CoinPurchase
from src.repositories.coins import CoinRepository
from src.services.literacy.acts import award_for_user
from tests.factories import AccountFactory, CategoryFactory, ExpenseFactory, UserFactory

USER = 'wallet@test.com'


@pytest.fixture
def headers(auth_headers, wallet):
    """Bearer headers for the wallet user, via conftest's login factory."""
    return auth_headers(wallet)


@pytest.fixture
def wallet(db):
    user = UserFactory(id=USER, name='Wallet', password_plain='testpassword')
    acct = AccountFactory(user_id=user.id, name='C', type='checking', balance=500.0)
    cat = CategoryFactory(user_id=user.id, name='Rent')
    _db.session.commit()
    cat.spending_type, cat.kind = 'fixed', 'expense'
    acct.type_source = 'user'
    acct.import_source = 'simplefin'
    _db.session.commit()
    ExpenseFactory(user_id=user.id, account_id=acct.id, category_id=cat.id,
                   amount=-1800.0, description='rent',
                   date=datetime.date(2026, 8, 1), transaction_type='expense')
    _db.session.commit()
    award_for_user(user.id)
    _db.session.commit()
    return user


def test_the_wallet_reports_what_the_database_holds(client, wallet, headers):
    res = client.get('/api/v1/coins', headers=headers)
    assert res.status_code == 200
    body = res.get_json()

    assert body['earned'] == CoinRepository().earned(USER)
    assert body['balance'] == body['earned']
    assert body['acts'], 'a user who has done several acts got an empty list'


def test_NO_DENOMINATOR_ANYWHERE_IN_THE_PAYLOAD(client, wallet, headers):
    """*** A CLIENT MUST NOT BE ABLE TO RECONSTRUCT ONE. ***"""
    body = client.get('/api/v1/coins', headers=headers).get_json()
    raw = json.dumps(body)

    for banned in ('ceiling', 'coverage', 'total', 'of_total', 'max'):
        assert banned not in raw, (
            f'{banned!r} is on the wire. A client can render "n of m" from it, '
            'which is the one thing decision 5 forbids.')


def test_a_dormant_act_is_ABSENT_from_the_list_not_present_at_zero(
        client, wallet, headers):
    body = client.get('/api/v1/coins', headers=headers).get_json()
    slugs = {a['slug'] for a in body['acts']}

    assert 'debt_rates' not in slugs, (
        'a user with no debt was sent a debt act. Absent says "this does not '
        'apply to you"; present-at-zero says "you are failing at this".')


def test_gear_carries_a_price_because_the_user_chose_that_target(
        client, wallet, headers):
    """The one denominator decision 5 permits."""
    body = client.get('/api/v1/coins', headers=headers).get_json()
    rope = next(g for g in body['gear'] if g['slug'] == 'rope')
    assert rope['price'] > 0
    assert rope['owned'] is False


def test_buying_gear_writes_a_row_and_moves_the_balance(
        client, wallet, headers):
    before = CoinRepository().balance(USER)

    res = client.post('/api/v1/coins/purchase', json={'gear_slug': 'map'},
                      headers=headers)

    assert res.status_code == 200
    assert CoinPurchase.query.filter_by(user_id=USER, gear_slug='map').count() == 1
    # *** THE ACTUAL PRICE, NOT A HARDCODED 100. *** Gear prices are seed data
    # and §13 says so explicitly: "the exact numbers are open until the UI
    # exists to look at them". This test broke when the owner raised them on
    # 2026-09-17, which is a test pinning tuning rather than behaviour. What
    # matters is that the balance moves by what the piece cost.
    from src.services.literacy.gear import GEAR_PRICES
    assert CoinRepository().balance(USER) == before - GEAR_PRICES['map']
    assert CoinRepository().earned(USER) > CoinRepository().balance(USER)


def test_buying_the_same_piece_twice_is_409_not_a_silent_no_op(
        client, wallet, headers):
    """*** 409 AND 402 ASK THE USER FOR DIFFERENT THINGS AND MUST NOT COLLAPSE.
    *** One means *you already did this*; the other means *keep going*. A single
    400 leaves the client guessing, which is the distinction the Review page
    draws between a refusal and a no-op."""
    first = client.post('/api/v1/coins/purchase', json={'gear_slug': 'map'},
                        headers=headers)
    assert first.status_code == 200

    again = client.post('/api/v1/coins/purchase', json={'gear_slug': 'map'},
                        headers=headers)

    assert again.status_code == 409
    assert CoinPurchase.query.filter_by(user_id=USER, gear_slug='map').count() == 1


def test_a_user_who_has_earned_nothing_gets_402_and_no_row_is_written(
        client, db, auth_headers):
    """The real unaffordable case: somebody at base camp, before any act."""
    broke = UserFactory(id='broke@test.com', name='Broke',
                        password_plain='testpassword')
    _db.session.commit()
    broke_headers = auth_headers(broke)
    assert CoinRepository().balance('broke@test.com') == 0

    res = client.post('/api/v1/coins/purchase', json={'gear_slug': 'map'},
                      headers=broke_headers)

    assert res.status_code == 402
    assert res.get_json()['error']
    assert CoinPurchase.query.filter_by(user_id='broke@test.com').count() == 0


def test_an_unknown_piece_of_gear_is_404(client, wallet, headers):
    res = client.post('/api/v1/coins/purchase', json={'gear_slug': 'jetpack'},
                      headers=headers)
    assert res.status_code == 404
    assert CoinPurchase.query.filter_by(user_id=USER).count() == 0
