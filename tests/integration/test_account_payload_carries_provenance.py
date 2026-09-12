"""The accounts payload must carry `type_source`, `last_sync` and `import_source`.

*** THESE THREE ARE WHY THE CLIENT COULD NOT TELL A GUESS FROM A FACT, OR A
STALE ACCOUNT FROM A FRESH ONE. *** `last_sync` has existed and been maintained
since the SimpleFin integration shipped and was never serialized, so the
accounts page had nothing to render even though the data was right there.

Asserted on the PAYLOAD, not on the schema definition: a field can be declared
and still not survive `dump` if the attribute name does not match.
"""

from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from src.extensions import db as _db
from tests.factories import UserFactory, AccountFactory

ENDPOINT = '/api/v1/accounts'


@pytest.fixture
def user(db):
    return UserFactory(id='payload@test.com', name='Payload')


def _get(client, auth_headers, user):
    resp = client.get(ENDPOINT, headers=auth_headers(user))
    assert resp.status_code == 200, resp.get_json()
    return {a['name']: a for a in resp.get_json()['accounts']}


def test_THE_PAYLOAD_CARRIES_ALL_THREE_PROVENANCE_FIELDS(client, auth_headers, user):
    synced = datetime.utcnow() - timedelta(days=3)
    a = AccountFactory(user_id=user.id, name='Imported card', type='credit',
                       balance=Decimal('-830.00'))
    a.import_source, a.type_source, a.last_sync = 'simplefin', 'inferred', synced
    _db.session.commit()

    row = _get(client, auth_headers, user)['Imported card']
    assert row['type_source'] == 'inferred'
    assert row['import_source'] == 'simplefin'
    assert row['last_sync'] is not None, \
        'last_sync existed and was maintained but never reached the client'
    # *** AN EARLIER LINE HERE ENDED `or True` AND THEREFORE ASSERTED NOTHING. ***
    # Removed rather than repaired. This checks the value actually round-trips as
    # the timestamp that was stored, which is the only claim worth making.
    assert row['last_sync'].startswith(synced.strftime('%Y-%m-%d')), row['last_sync']


def test_a_MANUAL_account_reports_no_import_source_and_no_sync(
        client, auth_headers, user):
    """*** THE CLIENT NEEDS THIS TO STAY QUIET. *** A "never synced" badge on an
    account somebody types by hand is noise, and noise teaches people to ignore
    badges."""
    a = AccountFactory(user_id=user.id, name='Cash tin', type='checking',
                       balance=Decimal('40.00'))
    a.import_source, a.type_source, a.last_sync = None, 'user', None
    _db.session.commit()

    row = _get(client, auth_headers, user)['Cash tin']
    assert row['import_source'] is None
    assert row['last_sync'] is None
    assert row['type_source'] == 'user'


def test_a_connected_account_that_has_NEVER_synced_is_distinguishable(
        client, auth_headers, user):
    """`last_sync` NULL on a CONNECTED account is the worrying case -- it is
    connected and has never pulled anything -- and it must be tellable apart
    from a manual account, which is also NULL."""
    a = AccountFactory(user_id=user.id, name='Just linked', type='checking',
                       balance=Decimal('0.00'))
    a.import_source, a.type_source, a.last_sync = 'simplefin', 'default', None
    _db.session.commit()

    row = _get(client, auth_headers, user)['Just linked']
    assert row['last_sync'] is None and row['import_source'] == 'simplefin'
