"""The documented request body for /accounts must be a body that works.

AUDIT.md D-05. `account_model` in `api/v1/accounts.py` is attached to POST and
PUT with `@ns.expect(...)`, so it is the request body the API docs tell clients
to send. It advertised `account_number` and `is_active`, and neither is a column
on `Account`, neither is accepted by `AccountInput`, and neither is applied by any
handler.

Nothing rejects them either: `validate_request` loads with `unknown=EXCLUDE`, so a
client that follows the documentation gets `201`, sees its account created, and
never learns that part of what it sent was dropped on the floor. The mobile app's
"Account Number (last 4 digits)" field was discarded on every save for exactly
this reason.

These tests assert the invariant rather than naming the two offending fields, so
a field added to the docs without a handler to read it fails here.
"""

import pytest

from src.models.account import Account
from tests.factories import UserFactory

ENDPOINT = '/api/v1/accounts/'

# The documented name differs from the column for exactly one field.
DOCUMENTED_TO_ATTRIBUTE = {'account_type': 'type'}

# A value of the right shape for each documented field, used to prove the write
# path keeps it. Anything documented and missing here fails the coverage test
# below, which is the point: a new documented field has to be given a value and
# therefore checked.
SAMPLE_VALUES = {
    'name': 'Documented Fields Account',
    'account_type': 'savings',
    'balance': 321.5,
    'currency_code': 'USD',
    'institution': 'Test Bank',
    'color': '#3b82f6',
}


@pytest.fixture
def user(db):
    return UserFactory(password_plain='secret')


def _documented_fields(app):
    """The field names `account_model` advertises for POST/PUT bodies."""
    from api.v1.accounts import account_model
    return sorted(account_model.keys())


def test_every_documented_field_exists_on_the_model(app):
    """A documented field with no column cannot be stored by anything."""
    for field in _documented_fields(app):
        attribute = DOCUMENTED_TO_ATTRIBUTE.get(field, field)
        assert hasattr(Account, attribute), (
            f'/accounts documents {field!r} but Account has no {attribute!r}. '
            f'Either implement it or stop advertising it.'
        )


def test_the_sample_covers_every_documented_field(app):
    """Guards the test below from passing by skipping a field."""
    assert set(_documented_fields(app)) == set(SAMPLE_VALUES), (
        'SAMPLE_VALUES is out of step with the documented body; a new documented '
        'field needs a value here so the round-trip test actually checks it.'
    )


def test_posting_the_documented_body_persists_every_field(client, auth_headers,
                                                          user, app):
    """The discriminating assertion: read the row back out of the database.

    A status code cannot catch this. The request succeeds either way — what
    differs is whether what the client sent is still there afterwards.
    """
    resp = client.post(ENDPOINT, json=dict(SAMPLE_VALUES),
                       headers=auth_headers(user, password='secret'))
    assert resp.status_code in (200, 201), resp.get_json()

    account = Account.query.filter_by(user_id=user.id,
                                      name=SAMPLE_VALUES['name']).one()

    for field, sent in SAMPLE_VALUES.items():
        attribute = DOCUMENTED_TO_ATTRIBUTE.get(field, field)
        stored = getattr(account, attribute)
        if isinstance(sent, float):
            assert stored == pytest.approx(sent, abs=0.01), field
        else:
            assert stored == sent, (
                f'/accounts documents {field!r}, accepted it, and did not store '
                f'it: sent {sent!r}, stored {stored!r}.'
            )
