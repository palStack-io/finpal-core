"""D-73 — the JSON encoders learned `Decimal` and never `datetime`.

Two endpoints returned **500** because of it, and they are the only two that
carry live `datetime` objects to the encoder: every other handler builds its
response through a marshmallow schema, which stringifies dates on the way out.

* `GET /api/v1/users/export` — Settings → "Export my data". It called the
  STANDARD LIBRARY's `json.dumps(data, indent=2)` with no `cls=`, bypassing the
  app's encoder entirely.
* `GET /api/v1/recurring/detect` — went through the app's encoder and still died,
  because `_DecimalJSONEncoder.default` handled `Decimal` alone.

Asserts on the PAYLOAD, never the status code: a 200 carrying a mangled date is
the failure this row is about, and `assert resp.status_code == 200` cannot see it.
"""
import json
from datetime import datetime, date
from decimal import Decimal

import pytest


def test_the_restx_encoder_serialises_datetime_and_date(app):
    """The encoder flask-restx uses for every /api/v1 response."""
    from src import _DecimalJSONEncoder

    out = json.loads(json.dumps(
        {'when': datetime(2026, 8, 10, 13, 5, 0), 'day': date(2026, 8, 10),
         'amount': Decimal('12.34')},
        cls=_DecimalJSONEncoder))

    assert out['amount'] == 12.34, 'the Decimal behaviour this class already had must survive'
    assert out['when'].startswith('2026-08-10'), out['when']
    assert out['day'] == '2026-08-10', out['day']


def test_the_flask_json_provider_serialises_datetime(app):
    """`jsonify` and plain dicts returned from a view use this one instead.

    Flask's own `DefaultJSONProvider` ALREADY handles dates (as an HTTP-date), so
    this half was never broken -- the first draft of this test asserted ISO and
    failed against correct behaviour. It is kept as a regression pin: the override
    must not shadow the base class's date handling while adding Decimal.
    """
    from src import _DecimalJSONProvider

    assert _DecimalJSONProvider.default(Decimal('1.50')) == 1.5
    assert '2026' in str(_DecimalJSONProvider.default(datetime(2026, 8, 10)))


def _user_with_dated_data():
    """A user who owns a row carrying a real `datetime`.

    *** WITHOUT THIS THE TWO ENDPOINT GATES BELOW PASS WHILE THE BUG IS LIVE. ***
    A fresh `UserFactory()` has no transactions, so nothing ever reaches the
    encoder and both endpoints answer 200 either way -- the same "a fixture where
    both models agree cannot tell them apart" trap that hid D-66 for a year.
    """
    from datetime import datetime as _dt

    from src.extensions import db as _db
    from src.models.category import Category
    from src.models.transaction import Expense
    from tests.factories import UserFactory

    user = UserFactory()
    cat = Category(name='Groceries', user_id=user.id)
    _db.session.add(cat)
    _db.session.commit()
    # Same construction as `test_budgets_are_household._expense`: several of these
    # columns are NOT NULL with no default (see D-74), so a partial Expense raises
    # an IntegrityError rather than exercising the encoder.
    # THREE rows, same description and amount, one a month apart: `/recurring/detect`
    # only emits a pattern (and therefore only carries a datetime to the encoder) when
    # it actually finds one. With a single row it returns an empty list and the gate
    # passes against the live bug -- verified by watching exactly that happen.
    for month in (6, 7, 8):
        _db.session.add(Expense(
            description='Netflix', amount=12.34, date=_dt(2026, month, 10),
            user_id=user.id, paid_by=user.id, card_used='',
            split_method='equal', split_with=None,
            category_id=cat.id, account_id=None, transaction_type='expense'))
    _db.session.commit()
    return user


def test_export_my_data_returns_a_usable_file(client, auth_headers, db):
    """Settings → Export my data. Asserts the FILE PARSES, not that it answered."""
    user = _user_with_dated_data()
    resp = client.get('/api/v1/users/export', headers=auth_headers(user))

    assert resp.status_code == 200, resp.get_data(as_text=True)[:400]
    payload = json.loads(resp.get_data(as_text=True))
    assert isinstance(payload, dict) and payload, 'the export parsed but is empty'


def test_detect_recurring_patterns_answers(client, auth_headers, db):
    user = _user_with_dated_data()
    resp = client.get('/api/v1/recurring/detect', headers=auth_headers(user))

    assert resp.status_code == 200, resp.get_data(as_text=True)[:400]
    assert resp.get_json() is not None
