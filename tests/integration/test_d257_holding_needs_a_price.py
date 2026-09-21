"""D-257: the API created a holding with no purchase price and reported its
entire market value as profit.

*** THE ASSERTION IS ON THE DATABASE, NOT THE STATUS. *** A 400 with a row
written is the defect wearing a different number.
"""
import pytest

from src.extensions import db as _db
from src.models.investment import Investment, Portfolio
from tests.factories import UserFactory

USER = 'd257@test.com'


@pytest.fixture
def owner(db):
    u = UserFactory(id=USER, name='D257', password_plain='testpassword')
    _db.session.commit()
    return u


@pytest.fixture
def portfolio(owner):
    p = Portfolio(name='P', user_id=owner.id)
    _db.session.add(p)
    _db.session.commit()
    return p


def test_omitting_the_purchase_price_is_refused_and_writes_nothing(
        owner, portfolio, auth_headers, client):
    res = client.post(
        '/api/v1/investments/holdings',
        json={'portfolio_id': portfolio.id, 'symbol': 'VTI', 'shares': 10},
        headers=auth_headers(owner))

    assert res.status_code == 400, res.get_json()
    assert Investment.query.filter_by(portfolio_id=portfolio.id).count() == 0


def test_an_explicit_zero_is_a_statement_and_is_still_accepted(
        owner, portfolio, auth_headers, client):
    """*** THE DEFECT IS THE SILENT DEFAULT, NOT THE VALUE. *** Refusing an
    explicit 0 would take away a legitimate answer."""
    res = client.post(
        '/api/v1/investments/holdings',
        json={'portfolio_id': portfolio.id, 'symbol': 'VTI',
              'shares': 10, 'purchase_price': 0},
        headers=auth_headers(owner))

    assert res.status_code == 201, res.get_json()
    row = Investment.query.filter_by(portfolio_id=portfolio.id).one()
    assert row.purchase_price == 0


def test_omitting_SHARES_is_refused_and_writes_nothing(
        owner, portfolio, auth_headers, client):
    """*** purchase_price's EXACT TWIN, FOUND BY ENUMERATING THE CLASS. ***

    `Investment.shares` is `nullable=False, default=0`, so omitting it stored a
    holding of ZERO shares and answered 201 — a position that exists, is worth
    nothing, and drags every portfolio total it belongs to. Measured before the
    fix: 201, with `shares = 0E-8`.
    """
    res = client.post(
        '/api/v1/investments/holdings',
        json={'portfolio_id': portfolio.id, 'symbol': 'VTI',
              'purchase_price': 50},
        headers=auth_headers(owner))

    assert res.status_code == 400, res.get_json()
    assert Investment.query.filter_by(portfolio_id=portfolio.id).count() == 0


def test_ZERO_shares_is_refused_unlike_a_zero_price(
        owner, portfolio, auth_headers, client):
    """*** THE TWO FIELDS GET DIFFERENT ANSWERS, DELIBERATELY. *** An explicit
    price of 0 is a statement — the holding was a gift or a grant. An explicit
    0 shares is not a statement; it is a row that should not exist."""
    res = client.post(
        '/api/v1/investments/holdings',
        json={'portfolio_id': portfolio.id, 'symbol': 'VTI',
              'shares': 0, 'purchase_price': 50},
        headers=auth_headers(owner))

    assert res.status_code == 400, res.get_json()
    assert Investment.query.filter_by(portfolio_id=portfolio.id).count() == 0
