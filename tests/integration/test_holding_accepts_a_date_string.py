"""D-85 — adding a holding failed from BOTH clients, because they send a date string.

`api/v1/investments.py`'s holdings POST does:

    purchase_date=data.get('purchase_date', datetime.utcnow())

`Investment.purchase_date` is `db.DateTime` (`src/models/investment.py:50`), and both
clients send a `YYYY-MM-DD` **string** — mobile's `HoldingForm` always includes it, and
web's `AddHoldingModal.tsx:112` does too. So the insert raises
`TypeError: SQLite DateTime type only accepts Python datetime and date objects`, the bare
`except Exception` swallows it, and the client gets **400 "Internal server error"**.

*** THIS IS D-80'S BUG IN A SECOND HANDLER. *** That row was the recurring detector handing
`add_recurring` a serialised date; this is a form handing the holdings route one. Measured
rather than inferred: the byte-identical payload **with** `purchase_date` answers 400 and
**without** it answers 201, and the column is a `DateTime`.

**Why nothing caught it:** the holdings POST calls `yf_cache.get_ticker_info`, so no test in
this suite had ever exercised it — a network dependency with no seam is a route that never
gets a test. It is patched below, which is what makes this path testable at all.

**A third `_coerce_date` now exists in this codebase** — `src/services/transaction/creation.py`
has one, `RecurringService._coerce_start_date` (D-80) has another, and this fix adds parsing
here. Their contracts genuinely differ (one falls back to `utcnow`, one returns `None` so the
caller can name the error), so they are NOT unified in this change; that is a separate,
testable step and is recorded rather than done silently.
"""
from datetime import datetime
from unittest.mock import patch

from src.extensions import db as _db
from src.models.investment import Investment, Portfolio
from tests.factories import UserFactory

URL = '/api/v1/investments/holdings/'

STOCK = {'name': 'Microsoft Corporation', 'price': 506.06,
         'sector': 'Technology', 'industry': 'Software'}


def _portfolio(owner, name='Retirement'):
    p = Portfolio(name=name, user_id=owner.id)
    _db.session.add(p)
    _db.session.commit()
    return p


def _payload(portfolio, **over):
    """What mobile's `HoldingForm.validate()` returns, and web's modal posts."""
    body = {'portfolio_id': portfolio.id, 'symbol': 'MSFT', 'shares': 5,
            'purchase_price': 100, 'purchase_date': '2026-08-10'}
    body.update(over)
    return body


def test_a_date_only_string_creates_the_holding(client, db, auth_headers):
    """The exact shape both forms send. This answered 400 before the fix."""
    user = UserFactory()
    p = _portfolio(user)

    with patch('api.v1.investments.yf_cache.get_ticker_info', return_value=STOCK):
        resp = client.post(URL, headers=auth_headers(user), json=_payload(p))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    # Assert on the row, and on the DATE ITSELF: falling back to utcnow() would also
    # produce a 201 while silently discarding what the user typed.
    row = Investment.query.filter_by(portfolio_id=p.id, symbol='MSFT').one()
    assert isinstance(row.purchase_date, datetime)
    assert (row.purchase_date.year, row.purchase_date.month, row.purchase_date.day) == (2026, 8, 10)


def test_a_full_iso_timestamp_is_also_accepted(client, db, auth_headers):
    """Any client generating an ISO timestamp must work too — D-80's payload shape."""
    user = UserFactory()
    p = _portfolio(user, 'Trading')

    with patch('api.v1.investments.yf_cache.get_ticker_info', return_value=STOCK):
        resp = client.post(URL, headers=auth_headers(user),
                           json=_payload(p, purchase_date='2026-08-10T00:00:00'))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    row = Investment.query.filter_by(portfolio_id=p.id).one()
    assert (row.purchase_date.year, row.purchase_date.month) == (2026, 8)


def test_omitting_the_date_still_works(client, db, auth_headers):
    """The control. It is the ONE case that worked before, so if the fix ever regresses
    into "reject everything", this is what stays green and localises it."""
    user = UserFactory()
    p = _portfolio(user, 'NoDate')

    with patch('api.v1.investments.yf_cache.get_ticker_info', return_value=STOCK):
        resp = client.post(URL, headers=auth_headers(user),
                           json={'portfolio_id': p.id, 'symbol': 'MSFT',
                                 'shares': 1, 'purchase_price': 10})

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    assert Investment.query.filter_by(portfolio_id=p.id).count() == 1


def test_an_unparseable_date_is_refused_by_name(client, db, auth_headers):
    """The second fault: the client was told "Internal server error" for a bad date.

    A rejected date must name itself, and the message must NOT be the exception's text —
    that is D-41, which this file's handler is one of the last places to honour.
    """
    user = UserFactory()
    p = _portfolio(user, 'BadDate')

    with patch('api.v1.investments.yf_cache.get_ticker_info', return_value=STOCK):
        resp = client.post(URL, headers=auth_headers(user),
                           json=_payload(p, purchase_date='not-a-date'))

    assert resp.status_code == 400
    body = str(resp.get_json()).lower()
    assert 'purchase date' in body or 'purchase_date' in body, f'the error does not name the field: {body}'
    assert 'internal server error' not in body, f'still the opaque message: {body}'
    assert 'traceback' not in body and 'sqlalchemy' not in body
    assert Investment.query.filter_by(portfolio_id=p.id).count() == 0


def test_a_buy_transaction_is_recorded_with_the_holding(client, db, auth_headers):
    """The handler also writes an InvestmentTransaction, and it reuses the same date.

    Worth pinning: `investment_transactions` was empty on the seeded database, so nothing
    had ever demonstrated this side effect happening at all.
    """
    from src.models.investment import InvestmentTransaction

    user = UserFactory()
    p = _portfolio(user, 'WithBuy')

    with patch('api.v1.investments.yf_cache.get_ticker_info', return_value=STOCK):
        resp = client.post(URL, headers=auth_headers(user), json=_payload(p))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    row = Investment.query.filter_by(portfolio_id=p.id).one()
    buys = InvestmentTransaction.query.filter_by(investment_id=row.id).all()
    assert len(buys) == 1
    assert buys[0].transaction_type == 'buy'
    assert isinstance(buys[0].date, datetime)
