"""Transaction search matches the note as well as the description.

Owner request, 2026-10-01: notes on transactions are only useful if you can find a
transaction by what you wrote in one. Both clients search server-side through `?search=`,
so this one filter covers web, mobile, and mobile builds already installed.

Asserted on the returned ids, never on the status code.
"""
from tests.factories import UserFactory


def _create(client, headers, description, notes=None):
    body = {'description': description, 'amount': 10, 'date': '2026-09-30',
            'transaction_type': 'expense'}
    if notes is not None:
        body['notes'] = notes
    resp = client.post('/api/v1/transactions/', headers=headers, json=body)
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    return resp.get_json()['transaction']['id']


def _search(client, headers, term):
    resp = client.get(f'/api/v1/transactions/?search={term}', headers=headers)
    return {t['id'] for t in resp.get_json()['transactions']}


def test_a_word_only_in_the_note_finds_the_transaction(client, db, auth_headers):
    user = UserFactory()
    h = auth_headers(user)
    noted = _create(client, h, 'Hardware store', notes='Paint for the nursery')
    other = _create(client, h, 'Groceries', notes='Weekly shop')

    assert _search(client, h, 'nursery') == {noted}
    assert other not in _search(client, h, 'nursery')


def test_description_search_still_works_and_a_null_note_does_not_break_it(client, db, auth_headers):
    user = UserFactory()
    h = auth_headers(user)
    no_note = _create(client, h, 'Coffee beans')
    with_note = _create(client, h, 'Bakery', notes='coffee cake for Sam')

    assert _search(client, h, 'coffee') == {no_note, with_note}
    assert _search(client, h, 'zzz-no-match') == set()
