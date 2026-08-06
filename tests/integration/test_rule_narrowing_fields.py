"""`amount_min`, `amount_max` and `transaction_type_filter` narrow a rule, and
the create/update handlers dropped all three.

These are the fields that stop a rule from firing. `TransactionRule.matches()`
reads every one of them (`transaction_rule.py:69-84`): the type filter short-
circuits on a mismatch, and the amount range compares `abs(amount)` against both
bounds. The model stores them, `to_dict()` returns them, `web-ui`'s rule form
collects them (`TransactionRules.tsx:608-662`) and renders them back on the rule
card (`:289-299`).

`create_rule` and `update_rule` never read them off the request. Every rule saved
through the API was therefore **broader than the user asked for** — it fired on
transactions the amount range was drawn to exclude, auto-categorising them.

Two details make this worse than a dropped field:

  * `to_dict()` is in the create response, so the 201 answered `amount_min: null`
    for a request that supplied `50` — the same shape as D-23.
  * `POST /transaction-rules/test` *does* accept all three when previewing an
    unsaved rule. So the preview and the saved rule disagreed for a byte-identical
    definition: proven on the deployed instance, where a rule narrowed to
    50 <= amount <= 200 previewed `matches: False` against a 5.00 coffee and then,
    once saved, answered `matches: True` for the same sample.

`PUT` could not repair a rule either, so the three columns were unreachable
through the entire API.

The behavioural assertions below go through `matches()` rather than the stored
column alone, because whether the rule fires is the thing a user experiences.

Coercion is tested because the fix has to survive input the number inputs cannot
produce but any other client can. `""` reaching a `db.Float` raises on commit and
the handler's `except Exception` would answer **500** — the failure mode PR #57
found for `int('')`. `test_malformed_body_never_500s.py` cannot see this: it sends
malformed *bodies*, not malformed *values* inside well-formed JSON.
"""
import pytest

from src.models.transaction_rule import TransactionRule
from tests.factories import UserFactory


def _create(client, user, auth_headers, **fields):
    payload = dict(name='Coffee', pattern='COFFEE')
    payload.update(fields)
    return client.post('/api/v1/transaction-rules', headers=auth_headers(user),
                       json=payload)


# --------------------------------------------------------------------------
# create
# --------------------------------------------------------------------------

def test_create_stores_the_amount_range(client, db, auth_headers):
    user = UserFactory()

    resp = _create(client, user, auth_headers, amount_min=50, amount_max=200)

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    rule = TransactionRule.query.filter_by(name='Coffee').first()
    assert (rule.amount_min, rule.amount_max) == (50.0, 200.0), (
        'the amount range was accepted with a 201 and dropped, so the rule '
        'fires on transactions the user drew the range to exclude')


def test_create_stores_the_transaction_type_filter(client, db, auth_headers):
    user = UserFactory()

    resp = _create(client, user, auth_headers, transaction_type_filter='expense')

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    rule = TransactionRule.query.filter_by(name='Coffee').first()
    assert rule.transaction_type_filter == 'expense'


def test_the_create_response_echoes_what_was_sent(client, db, auth_headers):
    """D-23's shape: a 201 that reports null for a value it was just given."""
    user = UserFactory()

    resp = _create(client, user, auth_headers, amount_min=50, amount_max=200,
                   transaction_type_filter='expense')

    body = resp.get_json()['rule']
    assert (body['amount_min'], body['amount_max'],
            body['transaction_type_filter']) == (50.0, 200.0, 'expense')


# --------------------------------------------------------------------------
# what the user actually experiences
# --------------------------------------------------------------------------

def test_a_narrowed_rule_does_not_fire_below_its_minimum(
        client, db, auth_headers):
    """The saved rule must agree with what the preview promised."""
    user = UserFactory()
    _create(client, user, auth_headers, amount_min=50, amount_max=200,
            transaction_type_filter='expense')

    rule = TransactionRule.query.filter_by(name='Coffee').first()

    assert rule.matches({'description': 'COFFEE SHOP', 'amount': 5,
                         'transaction_type': 'expense'}) is False, (
        'a 5.00 coffee matched a rule narrowed to 50-200, so the rule auto-'
        'categorises transactions the user excluded')
    assert rule.matches({'description': 'COFFEE SHOP', 'amount': 120,
                         'transaction_type': 'expense'}) is True


def test_a_type_filtered_rule_does_not_fire_on_another_type(
        client, db, auth_headers):
    user = UserFactory()
    _create(client, user, auth_headers, transaction_type_filter='expense')

    rule = TransactionRule.query.filter_by(name='Coffee').first()

    assert rule.matches({'description': 'COFFEE SHOP', 'amount': 10,
                         'transaction_type': 'income'}) is False
    assert rule.matches({'description': 'COFFEE SHOP', 'amount': 10,
                         'transaction_type': 'expense'}) is True


def test_the_preview_and_the_saved_rule_agree(client, db, auth_headers):
    """`/test` accepted these fields while `create` dropped them, so the same
    definition previewed one way and saved the other."""
    user = UserFactory()
    headers = auth_headers(user)
    definition = dict(name='Coffee', pattern='COFFEE', amount_min=50,
                      amount_max=200, transaction_type_filter='expense')
    sample = {'description': 'COFFEE SHOP', 'amount': 5,
              'transaction_type': 'expense'}

    preview = client.post('/api/v1/transaction-rules/test', headers=headers,
                          json={**definition, 'test_transaction': sample})
    assert preview.status_code == 200
    previewed = preview.get_json()['matches']

    client.post('/api/v1/transaction-rules', headers=headers, json=definition)
    rule_id = TransactionRule.query.filter_by(name='Coffee').first().id
    saved = client.post('/api/v1/transaction-rules/test', headers=headers,
                        json={'rule_id': rule_id, 'test_transaction': sample})
    assert saved.status_code == 200

    assert saved.get_json()['matches'] == previewed, (
        'the preview and the saved rule disagreed for an identical definition')


# --------------------------------------------------------------------------
# update
# --------------------------------------------------------------------------

def test_update_sets_the_narrowing_fields(client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    _create(client, user, auth_headers)
    rule_id = TransactionRule.query.filter_by(name='Coffee').first().id

    resp = client.put(f'/api/v1/transaction-rules/{rule_id}', headers=headers,
                      json={'amount_min': 50, 'amount_max': 200,
                            'transaction_type_filter': 'expense'})

    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    body = resp.get_json()['rule']
    assert (body['amount_min'], body['amount_max'],
            body['transaction_type_filter']) == (50.0, 200.0, 'expense')


def test_update_can_clear_the_narrowing_fields(client, db, auth_headers):
    """Widening a rule again has to be reachable, or the fix traps users in the
    first range they saved."""
    user = UserFactory()
    headers = auth_headers(user)
    _create(client, user, auth_headers, amount_min=50, amount_max=200,
            transaction_type_filter='expense')
    rule_id = TransactionRule.query.filter_by(name='Coffee').first().id

    resp = client.put(f'/api/v1/transaction-rules/{rule_id}', headers=headers,
                      json={'amount_min': None, 'amount_max': None,
                            'transaction_type_filter': None})

    assert resp.status_code == 200
    body = resp.get_json()['rule']
    assert (body['amount_min'], body['amount_max'],
            body['transaction_type_filter']) == (None, None, None)


def test_update_leaves_unmentioned_fields_alone(client, db, auth_headers):
    """The handler patches on key presence; omitting a bound must not widen."""
    user = UserFactory()
    headers = auth_headers(user)
    _create(client, user, auth_headers, amount_min=50, amount_max=200)
    rule_id = TransactionRule.query.filter_by(name='Coffee').first().id

    client.put(f'/api/v1/transaction-rules/{rule_id}', headers=headers,
               json={'name': 'Coffee renamed'})

    rule = db.session.get(TransactionRule, rule_id)
    assert (rule.amount_min, rule.amount_max) == (50.0, 200.0)


# --------------------------------------------------------------------------
# coercion — none of these may answer 5xx
# --------------------------------------------------------------------------

@pytest.mark.parametrize('blank', ['', None])
def test_a_blank_bound_is_stored_as_null_not_a_500(
        client, db, auth_headers, blank):
    user = UserFactory()

    resp = _create(client, user, auth_headers, amount_min=blank)

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    rule = TransactionRule.query.filter_by(name='Coffee').first()
    assert rule.amount_min is None


def test_a_numeric_string_bound_is_accepted(client, db, auth_headers):
    """Any client that does not coerce client-side sends strings."""
    user = UserFactory()

    resp = _create(client, user, auth_headers, amount_min='50', amount_max='200')

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    rule = TransactionRule.query.filter_by(name='Coffee').first()
    assert (rule.amount_min, rule.amount_max) == (50.0, 200.0)


@pytest.mark.parametrize('bad', ['abc', [], {}, True])
def test_an_unparseable_bound_is_named_in_a_400(client, db, auth_headers, bad):
    user = UserFactory()

    resp = _create(client, user, auth_headers, amount_min=bad)

    assert resp.status_code == 400, (
        f'{bad!r} as amount_min answered {resp.status_code}; an unparseable '
        f'value must be refused by name, never reach the Float column')
    assert 'amount_min' in resp.get_json()['error']
    assert TransactionRule.query.filter_by(name='Coffee').first() is None


def test_an_unparseable_bound_on_update_leaves_the_rule_unchanged(
        client, db, auth_headers):
    user = UserFactory()
    headers = auth_headers(user)
    _create(client, user, auth_headers, amount_min=50)
    rule_id = TransactionRule.query.filter_by(name='Coffee').first().id

    resp = client.put(f'/api/v1/transaction-rules/{rule_id}', headers=headers,
                      json={'amount_min': 'abc'})

    assert resp.status_code == 400
    rule = db.session.get(TransactionRule, rule_id)
    assert rule.amount_min == 50.0


def test_an_unknown_transaction_type_filter_is_refused(client, db, auth_headers):
    """`matches()` compares the filter against `transaction_type` verbatim, so a
    value outside the three real types silently stops the rule matching
    anything."""
    user = UserFactory()

    resp = _create(client, user, auth_headers, transaction_type_filter='all')

    assert resp.status_code == 400, (
        "'all' is not a transaction type; stored verbatim it would compare "
        'unequal to every transaction and the rule would never fire')
    assert 'transaction_type_filter' in resp.get_json()['error']


def test_the_preview_refuses_what_create_would_refuse(client, db, auth_headers):
    """A preview that answers a confident `matches: false` for a definition the
    save path rejects is the same divergence in the other direction."""
    user = UserFactory()

    resp = client.post('/api/v1/transaction-rules/test',
                       headers=auth_headers(user),
                       json={'pattern': 'COFFEE', 'amount_min': 'abc',
                             'test_transaction': {'description': 'COFFEE',
                                                  'amount': 5}})

    assert resp.status_code == 400
    assert 'amount_min' in resp.get_json()['error']


def test_an_inverted_range_is_refused(client, db, auth_headers):
    """min above max matches nothing, so it is always a mistake."""
    user = UserFactory()

    resp = _create(client, user, auth_headers, amount_min=200, amount_max=50)

    assert resp.status_code == 400
    assert TransactionRule.query.filter_by(name='Coffee').first() is None
