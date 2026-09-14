"""An unknown currency code must be a named refusal, not a 500 (D-215).

*** THE WHOLE SUITE WAS GREEN ON THIS AND THE LIVE DEMO WAS NOT. ***
`users.default_currency_code` and `accounts.currency_code` are foreign keys into
`currencies`, and every writer took the client's word for the value. SQLite does
not enforce a foreign key unless it is asked to, so 2,269 tests said nothing;
Postgres does, and both deployed stacks are Postgres.

Measured against the live demo before any of this was written:

    PUT  /api/v1/users/profile   {"default_currency_code": "TRY"}   -> 500
    POST /api/v1/auth/onboarding {"default_currency_code": "TRY"}   -> 500

and after the second one `has_completed_onboarding` was **still false** — so a
user who picked that currency on mobile's new first-run screen would have been
handed the wizard again on every launch, for ever, with no error to act on.

*** SO THESE TESTS ASSERT A 400 AND THE UNCHANGED COLUMN, NEVER A NON-500. ***
On SQLite the pre-fix code answered **200** and wrote a dangling code, which is
the shape that has to redden: a test written as "not 500" would have passed
before the fix on this engine and after it on the other.

The two currencies that exposed it — **TRY** and **RUB** — were in mobile's
twenty-item picker and absent from the twenty-two-row table. They are seeded
now; `test_the_picker_currencies_are_all_stocked` is the half that keeps the two
sets from drifting apart again.
"""
import pytest

from src.models.user import User
from src.models.account import Account
from src.utils.money import is_a_known_currency
from tests.factories import UserFactory


UNKNOWN = 'ZZZ'


def test_an_unknown_currency_is_refused_by_name_on_the_profile(client, auth_headers, db):
    user = UserFactory(password_plain='secret', default_currency_code='USD')
    headers = auth_headers(user, password='secret')

    response = client.put('/api/v1/users/profile', headers=headers,
                          json={'default_currency_code': UNKNOWN})

    assert response.status_code == 400, response.get_json()
    assert 'default_currency_code' in str(response.get_json())
    db.session.expire_all()
    assert User.query.filter_by(id=user.id).first().default_currency_code == 'USD'


def test_an_unknown_currency_is_refused_by_name_on_onboarding(client, auth_headers, db):
    # *** THE FACTORY'S DEFAULT IS `True`, AND THE FIRST DRAFT OF THIS TEST
    # ASSERTED AGAINST THAT INSTEAD OF AGAINST THE BEHAVIOUR. *** The user who
    # can be trapped is the one who has NOT onboarded, so the fixture has to be
    # that user or the assertion is about the factory.
    user = UserFactory(password_plain='secret', default_currency_code='USD',
                       has_completed_onboarding=False)
    headers = auth_headers(user, password='secret')

    response = client.post('/api/v1/auth/onboarding', headers=headers,
                           json={'default_currency_code': UNKNOWN,
                                 'timezone': 'Europe/Istanbul'})

    assert response.status_code == 400, response.get_json()
    db.session.expire_all()
    fresh = User.query.filter_by(id=user.id).first()
    assert fresh.default_currency_code == 'USD'
    # *** AND NOTHING ELSE IN THE BODY IS APPLIED. *** A partial write here is
    # worse than a refusal: the user would be onboarded with the currency they
    # did not get, and no screen would ever ask again.
    assert fresh.timezone != 'Europe/Istanbul'
    # Unchanged — which is the honest outcome of a refusal. The user is told,
    # and the flow can ask again; what it must not be is 500 with the flag left
    # false and no message, which is what shipped.
    assert fresh.has_completed_onboarding is False


def test_a_stocked_currency_still_completes_onboarding(client, auth_headers, db):
    """The control. A refusal that refuses everything proves nothing."""
    user = UserFactory(password_plain='secret', default_currency_code='USD')
    headers = auth_headers(user, password='secret')

    response = client.post('/api/v1/auth/onboarding', headers=headers,
                           json={'default_currency_code': 'TRY',
                                 'timezone': 'Europe/Istanbul'})

    assert response.status_code == 200, response.get_json()
    db.session.expire_all()
    fresh = User.query.filter_by(id=user.id).first()
    assert fresh.default_currency_code == 'TRY'
    assert fresh.timezone == 'Europe/Istanbul'
    assert fresh.has_completed_onboarding is True


def test_an_unknown_currency_cannot_create_an_account(client, auth_headers, db):
    user = UserFactory(password_plain='secret', default_currency_code='USD')
    headers = auth_headers(user, password='secret')
    before = Account.query.count()

    response = client.post('/api/v1/accounts/', headers=headers, json={
        'name': 'Lira account', 'account_type': 'checking',
        'balance': 0, 'currency_code': UNKNOWN,
    })

    assert response.status_code == 400, response.get_json()
    assert Account.query.count() == before


def test_an_unknown_currency_cannot_be_put_on_an_existing_account(
        client, auth_headers, db):
    user = UserFactory(password_plain='secret', default_currency_code='USD')
    headers = auth_headers(user, password='secret')
    created = client.post('/api/v1/accounts/', headers=headers, json={
        'name': 'Current', 'account_type': 'checking', 'balance': 0,
        'currency_code': 'GBP',
    })
    assert created.status_code in (200, 201), created.get_json()
    account_id = created.get_json().get('account', created.get_json()).get('id')

    response = client.put(f'/api/v1/accounts/{account_id}', headers=headers,
                          json={'currency_code': UNKNOWN})

    assert response.status_code == 400, response.get_json()
    db.session.expire_all()
    assert Account.query.filter_by(id=account_id).first().currency_code == 'GBP'


@pytest.mark.parametrize('code', [
    # The twenty codes `mobile/src/utils/money.ts` builds its picker from. Spelled
    # out rather than imported because it lives in a different git repository —
    # so this list is a COPY, and its being a copy is the point: if mobile adds a
    # symbol, this test does not fail, and the drift is caught the next time
    # somebody reads it. What it does catch is the reverse and likelier case, a
    # currency dropped from the seed while a shipped picker still offers it.
    'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'CAD', 'AUD', 'NZD', 'CHF',
    'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'ZAR', 'KRW', 'TRY', 'RUB',
])
def test_the_picker_currencies_are_all_stocked(app, db, code):
    assert is_a_known_currency(code), (
        f'{code} is offered by the shipped mobile picker and has no row in '
        f'`currencies` — choosing it is a foreign-key violation'
    )


def test_the_predicate_answers_for_the_edges(app, db):
    # `None` means "no preference" and is a legitimate column value, so callers
    # check presence and this function never sees it as valid.
    assert is_a_known_currency(None) is False
    assert is_a_known_currency('') is False
    assert is_a_known_currency('usd') is True, 'a code is not case'
    assert is_a_known_currency(UNKNOWN) is False
