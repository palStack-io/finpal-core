"""#133 / #134 — a recurring rule created as Income was stored as an Expense.

Reported as `palStack-io/finpal-core#133`, *"When creating a recurring transaction, even
if you select Income it will be created as Expense."* Filed against the iOS app, but the
client is **not** where it breaks — this is not D-52's shape a second time.

`transaction_type` is declared on `RecurringInput` (`schemas/input_schemas.py:149`) so it
survives validation and is sitting in `validated` — and then the handler simply does not
pass it on. `api/v1/recurring.py`'s `add_recurring(...)` call named eight fields and not
that one, `RecurringService.add_recurring` had no such parameter, and the constructor
never set the column, so it fell to the model default:

    transaction_type = db.Column(db.String(20), default='expense')

The API therefore answered **201** with a rule the user had explicitly marked as income.

*** IT AFFECTS EVERY CLIENT, NOT JUST MOBILE. *** `create-from-pattern` — the web UI's
**only** create path, per D-80 — dropped it at the same seam, even though the detector
puts a `transaction_type` in the pattern dict it hands over. So a detected *salary* became
a recurring *expense* on the web too.

Fixed in the SERVICE rather than the two handlers, for the reason `_coerce_start_date`
already records: every caller passes through `add_recurring`, so fixing one handler leaves
the next caller free to make the same mistake. Two callers already existed and both were
wrong.

**Why no gate caught it:** no test had ever POSTed a `transaction_type` to `/recurring/`.
The only create fixture in the suite is `{'description': 'Rent', 'amount': 100.0,
'frequency': 'monthly'}`, whose expected result is an expense either way — so the default
was indistinguishable from the stored value by construction.

The update path is the mirror image and is covered here too. `update_recurring` `setattr`s
arbitrary kwargs, so a PUT *could* set `transaction_type` while create could not; but it
applied **no date coercion**, unlike `add_recurring`. That was masked while #134 kept the
client from ever submitting the form, and arming the client would have armed this. Both
halves are asserted below so neither can regress alone.
"""
from datetime import datetime

from src.models.recurring import RecurringExpense
from src.services.recurring.service import RecurringService
from tests.factories import UserFactory


def test_creating_an_income_rule_through_the_api_stores_income(client, db, auth_headers):
    """The reported defect, end to end, asserted on the DATABASE and not the status code.

    Every bug this project has found returned 200 and rendered fine, so the row is the
    only acceptable witness.
    """
    user = UserFactory()
    headers = auth_headers(user)

    created = client.post('/api/v1/recurring/', headers=headers, json={
        'description': 'Salary',
        'amount': 4200.0,
        'frequency': 'monthly',
        'transaction_type': 'income',
    })

    assert created.status_code == 201, created.get_data(as_text=True)[:300]
    rows = RecurringExpense.query.filter_by(user_id=user.id).all()
    assert len(rows) == 1, f'answered {created.status_code} and wrote {len(rows)} rows'
    assert rows[0].transaction_type == 'income', (
        f"the user selected Income and the row says {rows[0].transaction_type!r} — "
        'the field was validated and then dropped before the constructor'
    )


def test_the_response_body_agrees_with_the_row(client, db, auth_headers):
    """A client that trusts the 201 body must not be told 'expense' either.

    Worth its own assertion: the row could be right while the serialiser reports the
    default, which is exactly how a half-fix would pass the test above.
    """
    user = UserFactory()
    headers = auth_headers(user)

    created = client.post('/api/v1/recurring/', headers=headers, json={
        'description': 'Freelance invoice',
        'amount': 900.0,
        'frequency': 'monthly',
        'transaction_type': 'income',
    })

    assert created.status_code == 201, created.get_data(as_text=True)[:300]
    body = created.get_json()
    payload = body.get('recurring') or body.get('recurring_expense') or body
    assert payload.get('transaction_type') == 'income', (
        f'the response says {payload.get("transaction_type")!r}: {body}'
    )


def test_an_expense_rule_is_still_an_expense(client, db, auth_headers):
    """The inverse of the symptom, per the standing rule.

    A fix that hardcoded 'income', or that made the field required, would pass the two
    tests above and break every ordinary rule. It must also survive the field being
    OMITTED, which is what every existing client sends.
    """
    user = UserFactory()
    headers = auth_headers(user)

    explicit = client.post('/api/v1/recurring/', headers=headers, json={
        'description': 'Rent', 'amount': 1200.0, 'frequency': 'monthly',
        'transaction_type': 'expense'})
    assert explicit.status_code == 201, explicit.get_data(as_text=True)[:300]

    omitted = client.post('/api/v1/recurring/', headers=headers, json={
        'description': 'Gym', 'amount': 30.0, 'frequency': 'monthly'})
    assert omitted.status_code == 201, omitted.get_data(as_text=True)[:300]

    by_description = {r.description: r.transaction_type
                      for r in RecurringExpense.query.filter_by(user_id=user.id).all()}
    assert by_description == {'Rent': 'expense', 'Gym': 'expense'}, by_description


def test_the_service_seam_accepts_a_transaction_type(client, db, auth_headers):
    """The fix belongs in the service, so assert it there as well as through the route.

    `add_recurring` is the choke point both handlers share. Testing only the route would
    let a future caller repeat the omission — the same argument the date-parsing comment
    in this service already makes.
    """
    user = UserFactory()

    success, message, row = RecurringService().add_recurring(
        user_id=user.id, description='Dividend', amount=50.0,
        frequency='monthly', transaction_type='income')

    assert success, f'add_recurring refused a transaction_type: {message}'
    assert row.transaction_type == 'income'


def test_a_detected_income_pattern_becomes_an_income_rule(client, db, auth_headers):
    """The WEB half. `create-from-pattern` is web-ui's only create path (D-80).

    This is the assertion that makes the row 'all clients' rather than 'mobile' — it goes
    through the second caller, which was independently broken at the same seam.
    """
    from src.services.recurring.service import RecurringService as _S

    user = UserFactory()
    # Straight at the seam the pattern path uses, with the detector's own key name. The
    # end-to-end detector route is already covered by D-80's test; what is new here is
    # that the TYPE survives the hop.
    success, message, row = _S().add_recurring(
        user_id=user.id, description='Payroll', amount=3000.0, frequency='monthly',
        start_date='2026-06-26T00:00:00', transaction_type='income')

    assert success, message
    assert row.transaction_type == 'income'
    assert isinstance(row.start_date, datetime), 'the date fix must not regress'


def test_updating_a_rule_coerces_its_dates(client, db, auth_headers):
    """#134's backend half, which fixing the mobile prefill would otherwise arm.

    `update_recurring` `setattr`s whatever it is given. Mobile's PUT carries
    `start_date` as a plain `'YYYY-MM-DD'` string, which lands in a `DateTime` column —
    the exact D-80 mechanism, on the path D-80 did not touch. Today the mobile regex
    blocks the submit, so this never fires; the moment the prefill is fixed it does.
    """
    user = UserFactory()
    service = RecurringService()
    success, _message, row = service.add_recurring(
        user_id=user.id, description='Insurance', amount=75.0, frequency='monthly')
    assert success

    ok, message = service.update_recurring(
        recurring_id=row.id, user_id=user.id, start_date='2027-03-09')

    assert ok, f'a YYYY-MM-DD string was refused on update: {message}'
    refreshed = db.session.get(RecurringExpense, row.id)
    assert isinstance(refreshed.start_date, datetime), (
        f'start_date persisted as {type(refreshed.start_date).__name__} on update — '
        'add_recurring coerces and update_recurring did not'
    )
    assert (refreshed.start_date.year, refreshed.start_date.month,
            refreshed.start_date.day) == (2027, 3, 9)


def test_an_unparseable_date_is_refused_on_update_too(client, db, auth_headers):
    """And it must be a NAMED refusal, not the generic message (D-41).

    *** THE OBVIOUS ASSERTION HERE PASSES VACUOUSLY AND THIS IS WHY IT IS NOT USED. ***
    `'date' in message.lower()` is TRUE of the generic failure "Could not update the
    recurring expense", because the substring `date` sits inside the word *up-date-*.
    Written that way this test was green against the unfixed service — a hole in the test,
    not a passing fix, and precisely the shape the standing rule about making a check fail
    first exists to catch. Assert on `start date` (with the space) so only a message that
    actually names the field can satisfy it.
    """
    user = UserFactory()
    service = RecurringService()
    _ok, _m, row = service.add_recurring(
        user_id=user.id, description='Water', amount=20.0, frequency='monthly')

    ok, message = service.update_recurring(
        recurring_id=row.id, user_id=user.id, start_date='not-a-date')

    assert not ok
    assert 'start date' in message.lower(), (
        f'the message does not name the field: {message}'
    )
    assert 'could not update the recurring expense' != message.lower(), (
        'the generic message is not a named refusal'
    )
    assert 'sqlalchemy' not in message.lower() and 'traceback' not in message.lower(), (
        f"the exception's text leaked to the caller (D-41): {message}"
    )
