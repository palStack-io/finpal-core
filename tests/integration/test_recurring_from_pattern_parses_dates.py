"""D-80 — "Create Recurring" on the app's own detected pattern always failed.

`/recurring` → **Detect Patterns** finds a series and offers **Create Recurring**. Clicking
it answered **400 "Could not save the recurring expense"** and wrote nothing, because
`api/v1/recurring.py` passes `start_date=pattern.get('start_date')` straight through and the
detector's pattern carries a **string** (`'2026-06-26T00:00:00'`, verified against the live
endpoint). `RecurringService.add_recurring` wrote it into a `DateTime` column with no parse:

    sqlalchemy.exc.StatementError: (builtins.TypeError)
    SQLite DateTime type only accepts Python datetime and date objects as input.

Its own `start_date or datetime.utcnow()` could not help — a non-empty string is truthy.

*** DETECTION IS THE ONLY WAY THE WEB UI CREATES A RECURRING TRANSACTION *** — that page has
no "Add Recurring" control at all — so the whole feature was unreachable from the browser.
This is **D-77's sibling and completes it**: D-77 made the demo's series *detectable*; this
is why detecting them still led nowhere.

**Two faults, and fixing one leaves the other**: the date was never parsed, and
`except Exception` flattened the `TypeError` into a message naming nothing, so the server
knew exactly what was wrong and told the client nothing. Both are covered below.

**Why no gate caught it:** the POST handler's tests pass an already-parsed date. Only
`create-from-pattern` feeds `add_recurring` the detector's *serialised* output, and nothing
exercised that pair — the same "two readers of one contract" shape as D-52 and D-67.
"""
from datetime import datetime, timedelta

from src.extensions import db as _db
from src.models.recurring import RecurringExpense
from src.models.transaction import Expense
from tests.factories import UserFactory


def _expense(owner, amount, description, when):
    e = Expense(description=description, amount=amount, date=when,
                user_id=owner.id, paid_by=owner.id, card_used='Cash',
                split_method='equal', transaction_type='expense',
                currency_code='USD')
    _db.session.add(e)
    return e


def _seed_a_detectable_monthly_series(owner, description='Netflix', amount=15.99):
    """Three rows one month apart, **two of them inside the detector's lookback**.

    Both halves matter and D-77 paid for learning the second: a textbook monthly cadence
    is not enough, because `detect_recurring_transactions` runs `lookback_days=60,
    min_occurrences=2` and a series of -90/-60/-30 puts only one row in the window. The
    offsets are read off the detector's own defaults rather than hardcoded, so tuning the
    window cannot leave this fixture silently detecting nothing.
    """
    from integrations.recurring.detector import detect_recurring_transactions
    lookback = (detect_recurring_transactions.__defaults__ or (60,))[0]
    today = datetime.utcnow()
    for offset in (lookback + 3, lookback // 2 + 3, 3):
        _expense(owner, amount, description, today - timedelta(days=offset))
    _db.session.commit()


def test_a_detected_pattern_can_be_turned_into_a_recurring_transaction(
        client, db, auth_headers):
    """End to end through both endpoints, asserting on the DATABASE.

    The pattern key is taken from what `/detect` actually returned rather than
    hand-written, so this cannot pass by asking for something the detector never offered.
    """
    user = UserFactory()
    _seed_a_detectable_monthly_series(user)
    headers = auth_headers(user)

    detected = client.get('/api/v1/recurring/detect', headers=headers)
    assert detected.status_code == 200, detected.get_data(as_text=True)[:300]
    patterns = detected.get_json().get('patterns') or []
    assert patterns, 'the fixture seeded no detectable series — see the helper above'
    key = patterns[0]['pattern_key']
    # The premise of the whole row: what the detector hands back is a STRING.
    assert isinstance(patterns[0]['start_date'], str)

    created = client.post('/api/v1/recurring/create-from-pattern',
                          headers=headers, json={'pattern_key': key})

    assert created.status_code == 201, created.get_data(as_text=True)[:300]
    rows = RecurringExpense.query.filter_by(user_id=user.id).all()
    assert len(rows) == 1, f'answered {created.status_code} and wrote {len(rows)} rows'
    assert isinstance(rows[0].start_date, datetime), (
        f'start_date persisted as {type(rows[0].start_date).__name__}, not a datetime')


def test_add_recurring_accepts_an_iso_string_start_date(client, db, auth_headers):
    """The service seam directly, because that is where the fix belongs.

    Every caller passes through `add_recurring`, so parsing there fixes the handler and
    any future caller at once. Fixing it in `api/v1/recurring.py` instead would leave the
    next caller free to make the same mistake.
    """
    from src.services.recurring.service import RecurringService

    user = UserFactory()
    success, message, row = RecurringService().add_recurring(
        user_id=user.id, description='FromString', amount=10.0,
        frequency='monthly', start_date='2026-06-26T00:00:00')

    assert success, f'add_recurring refused an ISO string: {message}'
    assert isinstance(row.start_date, datetime)
    assert (row.start_date.year, row.start_date.month, row.start_date.day) == (2026, 6, 26)


def test_a_date_only_string_is_also_accepted(client, db, auth_headers):
    """`YYYY-MM-DD` is what the ordinary POST body carries, so both shapes must work."""
    from src.services.recurring.service import RecurringService

    user = UserFactory()
    success, message, row = RecurringService().add_recurring(
        user_id=user.id, description='DateOnly', amount=5.0,
        frequency='weekly', start_date='2026-06-26')

    assert success, message
    assert (row.start_date.year, row.start_date.month, row.start_date.day) == (2026, 6, 26)


def test_an_unparseable_start_date_is_refused_by_name(client, db, auth_headers):
    """The second fault: the client was told nothing.

    `except Exception` returned "Could not save the recurring expense" for a plain type
    error the server had already logged in full. A rejected date must name itself — and
    the message must NOT be the exception's text, which is D-41.
    """
    from src.services.recurring.service import RecurringService

    user = UserFactory()
    success, message, row = RecurringService().add_recurring(
        user_id=user.id, description='Bad', amount=5.0,
        frequency='monthly', start_date='not-a-date')

    assert not success
    assert row is None
    assert 'start date' in message.lower(), f'the message does not name the field: {message}'
    assert 'traceback' not in message.lower() and 'sqlalchemy' not in message.lower(), (
        f"the exception's text leaked to the caller (D-41): {message}")
