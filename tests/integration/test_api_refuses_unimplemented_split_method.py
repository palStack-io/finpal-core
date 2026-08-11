"""The API must refuse a split method the backend cannot compute.

**AUDIT D-99, and it is the unfinished half of D-93.** D-93 removed "By Shares" from web-ui after
measuring that `calculate_splits` has no `shares` branch: a $100 expense with one other
participant returned payer 0, others `[]`, **total 0.00**, so the row saved and *nobody owed
anything*. That row says "web-ui only".

*** IT WAS NOT WEB-UI ONLY. `SPLIT_METHODS` IN `schemas/input_schemas.py` STILL LISTED `shares`,
SO THE API WENT ON ACCEPTING IT. *** Deleting the dropdown removed the affordance and left the
validator, which is worse than obvious: anyone using the documented REST API, a script, an LLM
with a personal access token, or a future mobile build could still create an expense that
silently splits to nobody — and now nothing in the UI would ever show them how it happened.

**Found by reading the public API docs on the palStack homepage**, which advertised the method
(alongside a `split_type` field that does not exist and a `POST /groups/:id/expenses` endpoint
that does not exist). Checking the docs against the code is what surfaced the gap in the fix.

This is [[project_closed_items_were_not_closed]] one level deeper, and the lesson AUDIT already
records in its own words: *the reported half is not the whole defect*. A defect reported in a
client is a defect in **every** client until the server refuses it.
"""
from schemas.input_schemas import SPLIT_METHODS
from tests.factories import UserFactory


def _payload(**overrides):
    body = {
        'description': 'Probe',
        'amount': 100.00,
        'transaction_type': 'expense',
        'card_used': 'cash',
        'date': '2026-08-11',
    }
    body.update(overrides)
    return body


def test_the_accepted_list_holds_only_methods_the_backend_computes():
    """Keyed to `calculate_splits`, so a method added to one side alone fails here.

    `src/models/transaction.py` branches on `none | equal | percentage | custom`. Anything else
    in this list is a value the API accepts and the arithmetic ignores.
    """
    assert 'shares' not in SPLIT_METHODS
    assert set(SPLIT_METHODS) <= {'equal', 'custom', 'percentage', 'none'}, SPLIT_METHODS


def test_creating_a_transaction_with_shares_is_refused(client, db, auth_headers):
    """The boundary that matters: a client that never saw the UI."""
    user = UserFactory()
    other = UserFactory()

    resp = client.post('/api/v1/transactions/',
                       json=_payload(split_method='shares', split_with=other.id,
                                     paid_by=user.id, split_value=2),
                       headers=auth_headers(user))

    assert resp.status_code == 400, (
        f'the API accepted a split method the backend cannot compute: {resp.status_code} '
        f'{resp.get_data(as_text=True)[:200]}')


def test_the_three_real_methods_are_still_accepted(client, db, auth_headers):
    """The inverse. Over-tightening this would break every legitimate split."""
    user = UserFactory()
    other = UserFactory()

    for method, value in (('equal', None), ('percentage', 50), ('custom', 40)):
        body = _payload(split_method=method, split_with=other.id, paid_by=user.id,
                        description=f'Probe {method}')
        if value is not None:
            body['split_value'] = value
        resp = client.post('/api/v1/transactions/', json=body, headers=auth_headers(user))
        assert resp.status_code in (200, 201), (
            f'{method} was refused: {resp.status_code} {resp.get_data(as_text=True)[:200]}')
