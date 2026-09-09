"""The three columns learnPal needs to teach utilisation and interest cost.

All NULLABLE, so no existing row changes meaning. Asserted through the API and
read back off the DATABASE, not off the response -- a handler that echoes its own
input passes a response-only test while persisting nothing (D-122's shape). That
is not hypothetical here: `validate_request` loads with `unknown=EXCLUDE`, so
until these three names exist on `AccountInput` the PUT answers **200** and
drops them on the floor. A status-code test would have passed against that.

Both write paths are covered. `account_model` is what `@ns.expect` advertises on
POST *and* PUT, and `test_accounts_documented_fields.py` exists because a field
the docs promise and no handler applies is D-05 -- so a field reachable only
through PUT while the docs offer it on both is the same defect with one door.
"""
from decimal import Decimal

from src.extensions import db as _db
from src.models.account import Account
from tests.factories import UserFactory, AccountFactory


def test_the_credit_fields_persist(client, auth_headers, db):
    user = UserFactory(id='cards@test.com', name='Cards')
    account = AccountFactory(user_id=user.id, name='Amex', type='credit')
    _db.session.commit()

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'credit_limit': '5000.00', 'apr': '19.99',
                            'min_payment': '35.00'})
    assert resp.status_code == 200, resp.get_json()

    _db.session.expire(account)
    stored = _db.session.get(Account, account.id)
    assert stored.credit_limit == Decimal('5000.00')
    assert stored.apr == Decimal('19.99')
    assert stored.min_payment == Decimal('35.00')


def test_the_credit_fields_persist_on_CREATE_too(client, auth_headers, db):
    """POST, not PUT. The docs advertise one body for both verbs."""
    user = UserFactory(id='cards2@test.com', name='Cards Two')

    resp = client.post('/api/v1/accounts/', headers=auth_headers(user),
                       json={'name': 'Visa', 'account_type': 'credit',
                             'credit_limit': '2500.00', 'apr': '24.49',
                             'min_payment': '25.00'})
    assert resp.status_code == 201, resp.get_json()

    stored = _db.session.get(Account, resp.get_json()['account']['id'])
    assert stored.credit_limit == Decimal('2500.00')
    assert stored.apr == Decimal('24.49')
    assert stored.min_payment == Decimal('25.00')


def test_apr_survives_the_round_trip_exactly(client, auth_headers, db):
    """Numeric(5,2), not Float. 19.99 has no exact binary representation and this
    number gets multiplied into money -- D-58 removed exactly that error.

    A float column stores 19.989999999999998, and `Decimal(19.99) != Decimal('19.99')`.
    """
    user = UserFactory(id='apr@test.com', name='Apr')
    account = AccountFactory(user_id=user.id, name='Card', type='credit')

    client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
               json={'apr': '19.99'})

    _db.session.expire(account)
    stored = _db.session.get(Account, account.id)
    assert isinstance(stored.apr, Decimal), type(stored.apr)
    assert str(stored.apr) == '19.99'


def test_an_existing_account_reads_them_as_NULL(db):
    """NULLABLE means an untouched row is unchanged, not zero.

    Zero is a claim ("this card has a $0 limit"); NULL is the absence of one. A
    default of 0 would make every pre-existing card look maxed out.
    """
    account = AccountFactory(user_id=UserFactory().id, name='Old', type='credit')
    _db.session.commit()
    assert account.credit_limit is None
    assert account.apr is None
    assert account.min_payment is None
