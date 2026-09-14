"""The currency list is the server's, and every client reads it (D-217).

*** THE DEFECT THIS FILE EXISTS FOR IS AN ABSENCE. *** There was no currency
route at all — verified against a real `url_map`, not by grepping — so the table
the foreign keys point at was invisible to every client, and each shipped its own
hardcoded guess: 22 seeded, 20 in mobile, 6 in web. Two of mobile's twenty had no
row, which is D-215's 500.

So the assertions here are about AGREEMENT, not about a status code: the payload
is compared against the seeded set, and against what `is_a_known_currency()` —
the predicate the writers use — actually accepts.
"""
import pytest

from src.models.currency import Currency
from src.utils.money import is_a_known_currency
from tests.factories import UserFactory


def test_the_list_is_every_row_the_foreign_keys_point_at(client, auth_headers, db):
    user = UserFactory(password_plain='secret')
    response = client.get('/api/v1/currencies/', headers=auth_headers(user, password='secret'))

    assert response.status_code == 200, response.get_json()
    served = {c['code'] for c in response.get_json()['currencies']}
    stocked = {row.code for row in Currency.query.all()}
    assert served == stocked, (
        'the picker would offer something the foreign key refuses, or hide '
        'something it accepts'
    )
    assert len(served) >= 20, f'only {len(served)} currencies seeded'


def test_every_served_code_is_one_the_writers_accept(client, auth_headers, db):
    """*** THE ENDPOINT AND THE VALIDATOR MUST AGREE, OR THE PICKER LIES. ***

    `is_a_known_currency()` is what `/auth/onboarding`, `PUT /users/profile` and
    both account writers call. A list served by one and refused by the other is
    exactly D-215 with an extra step.
    """
    user = UserFactory(password_plain='secret')
    response = client.get('/api/v1/currencies/', headers=auth_headers(user, password='secret'))

    for entry in response.get_json()['currencies']:
        assert is_a_known_currency(entry['code']), entry


def test_each_entry_carries_what_a_picker_renders(client, auth_headers, db):
    user = UserFactory(password_plain='secret')
    response = client.get('/api/v1/currencies/', headers=auth_headers(user, password='secret'))

    entries = response.get_json()['currencies']
    for entry in entries:
        assert set(entry) == {'code', 'name', 'symbol'}, entry
        assert len(entry['code']) == 3 and entry['code'].isupper(), entry
        assert entry['name'] and entry['symbol'], entry
    # Sorted, so two clients showing the same list show it in the same order
    # rather than each sorting it differently.
    codes = [e['code'] for e in entries]
    assert codes == sorted(codes)


def test_the_two_currencies_that_broke_onboarding_are_in_it(client, auth_headers, db):
    """D-215's pair, kept named: mobile offered them and the table had neither."""
    user = UserFactory(password_plain='secret')
    response = client.get('/api/v1/currencies/', headers=auth_headers(user, password='secret'))

    served = {c['code'] for c in response.get_json()['currencies']}
    assert {'TRY', 'RUB'} <= served


def test_it_needs_a_session(client, db):
    """Unlike the module catalogue, which is deliberately open.

    Nothing signed-out asks for a currency — registration does not offer one and
    both pickers are behind a login — so the narrower default applies.
    """
    assert client.get('/api/v1/currencies/').status_code == 401


def test_both_spellings_arrive(client, auth_headers, db):
    """web-ui omits the trailing slash and mobile includes it.

    *** MEASURED RATHER THAN ASSUMED, AND THE ASSUMPTION WAS WRONG. *** This was
    first written to expect a 308 redirect onto the declared rule; the slashless
    spelling answers **200 outright**, because this app does not run Flask's
    strict-slash defaults. Either way the client arrives — but the reason it
    arrives is not the one I guessed, and a test asserting the guess would have
    reddened the day that config changed for an unrelated reason.

    One RULE is declared: two would be a duplicate route and
    `_assert_no_new_duplicate_routes` refuses it.
    """
    user = UserFactory(password_plain='secret')
    headers = auth_headers(user, password='secret')
    for path in ('/api/v1/currencies', '/api/v1/currencies/'):
        response = client.get(path, headers=headers)
        assert response.status_code == 200, (path, response.status_code)
        assert response.get_json()['currencies'], path
