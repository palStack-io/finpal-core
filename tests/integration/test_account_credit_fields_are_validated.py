"""The credit fields' range ceilings are REAL and were UNGUARDED.

*** THIS FILE EXISTS BECAUSE THE PLAN THAT ASKED FOR IT WAS WRONG ABOUT ITS OWN
SUBJECT. *** C1a's brief said server-side range validation was "the one genuinely
missing piece" and told me to build `credit_field_error()` and wire it into both
verbs. It is not missing: `AccountInput` has carried

    apr = fields.Decimal(allow_none=True, places=2,
                         validate=validate.Range(min=0, max=999.99))

since #123, and a POST or PUT of `apr: 1999` already answers 400 with
`{'apr': ['Must be greater than or equal to 0 and less than or equal to 999.99.']}`.
Measured over HTTP before a line was written, because twelve task descriptions have
now been wrong about what they describe.

*** WHAT WAS ACTUALLY MISSING IS THIS FILE. *** Deleting that `validate=` left the
whole account suite green -- nine tests, including
`test_validators_fit_their_columns.py`, which looks like exactly the guard that
would catch it and is not: `_column_length()` reads `col.type.length`, which is
`None` for `Numeric`, so **that guard can only see String columns.** A ceiling on a
numeric column is invisible to it. So the range held by nothing but the line itself,
and the next person to tidy the schema would have moved the failure back to
Postgres's `NumericValueOutOfRange` -- a 500 where a 400 belongs, which is the exact
regression #123 was filed for.

Both verbs are asserted because the schema is shared but the CALL SITES are not:
POST reads `validated.get('apr')` and PUT reads `data['apr']` behind `if 'apr' in
data`, and D-99's rule is that a refusal proven in one place is not a refusal
everywhere until the other place is checked too.
"""
from decimal import Decimal

import pytest

from src.extensions import db as _db
from src.models.account import Account
from tests.factories import UserFactory, AccountFactory


OUT_OF_RANGE = '1999'          # Numeric(5,2) tops out at 999.99
JUST_OVER = '1000.00'          # the first value the column cannot hold
CEILING = '999.99'             # the largest it can


def _create(client, auth_headers, user, **fields):
    body = {'name': 'Test Card', 'account_type': 'credit'}
    body.update(fields)
    return client.post('/api/v1/accounts/', headers=auth_headers(user), json=body)


# ---------------------------------------------------------------------------
# POST
# ---------------------------------------------------------------------------

@pytest.mark.parametrize('value', [OUT_OF_RANGE, JUST_OVER, '-0.01', '-5'])
def test_CREATE_refuses_an_apr_the_column_cannot_hold(client, auth_headers, db, value):
    user = UserFactory(id=f'apr-post-{value}@test.com', name='APR')

    resp = _create(client, auth_headers, user, apr=value)

    assert resp.status_code == 400, resp.get_json()
    # The field is NAMED. A bare "Validation error" sends the user hunting through
    # a form with three numeric inputs on it.
    assert 'apr' in resp.get_json()['details'], resp.get_json()
    # And nothing was written: a refusal that half-creates the account is worse
    # than the 500 it replaced.
    assert Account.query.filter_by(user_id=user.id).count() == 0


@pytest.mark.parametrize('field', ['credit_limit', 'min_payment'])
def test_CREATE_refuses_a_NEGATIVE_limit_or_payment(client, auth_headers, db, field):
    # These two are Numeric(18,2), so there is no realistic ceiling -- the rule
    # that matters is the floor. A negative credit limit renders as available
    # credit below zero on a card nobody has used.
    user = UserFactory(id=f'{field}-post@test.com', name='Neg')

    resp = _create(client, auth_headers, user, **{field: '-1'})

    assert resp.status_code == 400, resp.get_json()
    assert field in resp.get_json()['details'], resp.get_json()


def test_CREATE_accepts_the_CEILING_itself_and_the_DATABASE_holds_it(client, auth_headers, db):
    # The boundary, from the inside. A range test that only proves refusals will
    # happily pass against `Range(max=0)`.
    user = UserFactory(id='apr-ceiling@test.com', name='Ceiling')

    resp = _create(client, auth_headers, user, apr=CEILING)

    assert resp.status_code == 201, resp.get_json()
    stored = Account.query.filter_by(user_id=user.id).one()
    assert stored.apr == Decimal('999.99')


def test_CREATE_accepts_ZERO_for_all_three(client, auth_headers, db):
    """0% intro APR, a 0 minimum payment and a 0 limit are all real.

    The handler uses `if 'x' in data` rather than truthiness precisely so these
    are settable; a `Range(min=0)` that excluded its own minimum would undo it.
    """
    user = UserFactory(id='zeros@test.com', name='Zeros')

    resp = _create(client, auth_headers, user, apr='0', credit_limit='0',
                   min_payment='0')

    assert resp.status_code == 201, resp.get_json()
    stored = Account.query.filter_by(user_id=user.id).one()
    assert (stored.apr, stored.credit_limit, stored.min_payment) == \
        (Decimal('0.00'), Decimal('0.00'), Decimal('0.00'))


# ---------------------------------------------------------------------------
# PUT -- the same schema, a DIFFERENT call site
# ---------------------------------------------------------------------------

def test_UPDATE_refuses_an_out_of_range_apr_AND_LEAVES_THE_ROW_ALONE(
        client, auth_headers, db):
    user = UserFactory(id='apr-put@test.com', name='APR Put')
    account = AccountFactory(user_id=user.id, name='Amex', type='credit')
    _db.session.commit()
    client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
               json={'apr': '19.99'})

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'apr': OUT_OF_RANGE})

    assert resp.status_code == 400, resp.get_json()
    assert 'apr' in resp.get_json()['details'], resp.get_json()
    # *** THE HALF A STATUS CODE CANNOT SEE. *** marshmallow rejects before the
    # handler runs today, but that is an implementation detail; what the user is
    # owed is that a refused edit did not damage the value they already had.
    _db.session.expire_all()
    assert _db.session.get(Account, account.id).apr == Decimal('19.99')


def test_UPDATE_can_still_CLEAR_a_field_with_null(client, auth_headers, db):
    # `allow_none=True` is what makes a field emptiable. A Range that rejected
    # None would make APR un-clearable once set -- #129's shape, and the schema
    # comment names it as the cautionary sibling.
    user = UserFactory(id='clear@test.com', name='Clear')
    account = AccountFactory(user_id=user.id, name='Visa', type='credit')
    _db.session.commit()
    client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
               json={'apr': '24.49'})

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'apr': None})

    assert resp.status_code == 200, resp.get_json()
    _db.session.expire_all()
    assert _db.session.get(Account, account.id).apr is None


def test_an_edit_that_never_mentions_apr_does_not_have_to_restate_it(
        client, auth_headers, db):
    # `partial=True` on the PUT plus `if 'apr' in data` in the handler. Renaming
    # an account must not silently blank its rate.
    user = UserFactory(id='untouched@test.com', name='Untouched')
    account = AccountFactory(user_id=user.id, name='Old name', type='credit')
    _db.session.commit()
    client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
               json={'apr': '12.50'})

    resp = client.put(f'/api/v1/accounts/{account.id}', headers=auth_headers(user),
                      json={'name': 'New name'})

    assert resp.status_code == 200, resp.get_json()
    _db.session.expire_all()
    stored = _db.session.get(Account, account.id)
    assert stored.name == 'New name'
    assert stored.apr == Decimal('12.50')
