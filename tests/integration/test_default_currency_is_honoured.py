"""
A user's default currency is the default. palStack-io/finpal-core#126.

Reported as: *"The default currency i set in my profile is not used when creating a new
account (i need to force Eur everytime) and when creating a transaction the icon is still
'$'."*

Both halves were real and they are in different layers, which is why the fix is in both:

  * **The client** — `AddAccountForm` set `defaultValues.currency = 'USD'` outright, so the
    picker opened on dollars whatever the profile said. That is the "force Eur every time".
    Fixed there and covered by web-ui's own suite; not testable from here.
  * **The server** — and this is the half that would have survived fixing only the form.
    `POST /accounts` fell back to the literal `'USD'` and so did `build_transaction`, so
    *any* client that omitted the field — mobile, a script, a token — got dollars for a
    user whose profile said EUR.

That distinction is the standing rule from D-99: a defect reported in a client is a defect
in every client until the server behaves. So these tests OMIT `currency_code` entirely,
which is the case the old code got wrong, rather than sending EUR and checking EUR came
back — that passed before the fix and proves nothing.
"""

import pytest

from tests.factories import UserFactory


@pytest.fixture
def eur_user(db):
    """A user who has told finPal, once, that they think in euros."""
    return UserFactory(default_currency_code='EUR')


def test_the_premise_the_profile_really_says_eur(eur_user):
    """If this ever fails the two tests below are vacuous."""
    assert eur_user.default_currency_code == 'EUR'


def test_an_account_created_without_a_currency_takes_the_profile_default(
        client, db, eur_user, auth_headers):
    resp = client.post('/api/v1/accounts', json={
        'name': 'Girokonto',
        'account_type': 'checking',
        'balance': 100,
        # currency_code deliberately ABSENT — this is the path that returned 'USD'
    }, headers=auth_headers(eur_user))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:400]
    assert resp.get_json()['account']['currency_code'] == 'EUR'


def test_a_transaction_created_without_a_currency_takes_the_profile_default(
        client, db, eur_user, auth_headers):
    resp = client.post('/api/v1/transactions/', json={
        'description': 'Kaffee',
        'amount': 3.5,
        'date': '2026-08-19',
        'transaction_type': 'expense',
        # currency_code deliberately ABSENT
    }, headers=auth_headers(eur_user))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:400]
    assert resp.get_json()['transaction']['currency_code'] == 'EUR'


def test_an_explicit_currency_still_wins_over_the_profile(
        client, db, eur_user, auth_headers):
    """
    The profile is a DEFAULT, not a constraint — a euro-thinking user must still be able to
    hold a dollar account. Asserted so the fix cannot be "read the profile" instead of
    "read the profile when the client said nothing".
    """
    resp = client.post('/api/v1/accounts', json={
        'name': 'US Savings',
        'account_type': 'savings',
        'balance': 0,
        'currency_code': 'USD',
    }, headers=auth_headers(eur_user))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:400]
    assert resp.get_json()['account']['currency_code'] == 'USD'


def test_a_user_with_no_preference_still_gets_something_valid(
        client, db, auth_headers):
    """
    `register()` writes `default_currency_code='USD'`, but a row could predate that or be
    built by a script, and `currency_code` is a foreign key into `currencies` — so falling
    back to None would be an IntegrityError rather than a wrong currency.
    """
    from src.extensions import db as _db

    user = UserFactory()
    user.default_currency_code = None
    _db.session.commit()

    resp = client.post('/api/v1/accounts', json={
        'name': 'Nameless', 'account_type': 'checking', 'balance': 0,
    }, headers=auth_headers(user))

    assert resp.status_code == 201, resp.get_data(as_text=True)[:400]
    assert resp.get_json()['account']['currency_code'] == 'USD'
