"""Every field web-ui sends on a create either lands, or is listed as dropped.

Written after PR #45 moved `POST /api/v1/transactions` — web-ui's create path —
from the unvalidated legacy blueprint onto the flask-restx handler, which validates
against `TransactionInput`. That swap could have broken creating a transaction from
the web UI outright, and nothing in the suite would have noticed: the MSW mocks do
not validate, and the page tests cover pagination rather than create.

Verified live against the deployed instance first — all five payload shapes
`AddTransactionForm` can build return 201. The form is what saves it: it omits
blank optionals (`if (data.category_id) payload.category_id = ...`) rather than
sending `''`, which marshmallow's `fields.Int` would reject.

The point of this file is that the result is now *measured* rather than assumed,
and that the fields which get silently discarded are named. `validate_request`
loads with `unknown=EXCLUDE`, so an unlisted field is dropped with a **201** — the
D-05 failure mode, where a client follows the contract and loses data.
"""
from datetime import datetime

from src.extensions import db
from src.models.account import Account
from src.models.category import Category
from src.models.transaction import Expense
from tests.factories import UserFactory


# Every key in web-ui's `TransactionPayload`
# (web-ui/src/components/forms/AddTransactionForm.tsx:32-47).
WEB_PAYLOAD_FIELDS = {
    'description', 'amount', 'date', 'transaction_type', 'currency_code',
    'notes', 'category_id', 'account_id', 'group_id', 'split_method',
    'split_value', 'destination_account_id', 'category_splits',
    'has_category_splits',
}

# Fields web-ui sends that the create path discards, each with the reason. These
# are NOT approved — they are pinned so the set cannot grow silently, and so that
# wiring one up makes this test fail and demands the entry be removed.
#
# All four predate PR #45: the legacy handler it replaced built a fixed
# `form_data` dict that had no key for any of them either. Checked before
# concluding that, because the legacy *service* does contain
# `_parse_category_splits` — but that reads `category_splits_data`, a JSON
# *string* holding a *list*, under a different name from the `category_splits`
# *dict* the web form sends, and the handler never passed it through regardless.
KNOWN_DROPPED = {
    # `destination_account_id` and `split_value` used to be listed here. Both are
    # accepted now, with the validation each needs — ownership plus
    # source-must-differ for the destination, and a range that depends on the split
    # method for the payer share. Covered by
    # `tests/integration/test_transfer_destination.py` and
    # `tests/integration/test_split_value.py`.
    #
    # Removing them was not optional:
    # `test_the_fields_web_sends_are_either_honoured_or_listed_as_dropped` fails on
    # an entry that has become accepted, which is what stops this list rotting into
    # a permanent excuse. It fired on both.
    #
    # `category_splits` has since been wired too — see
    # `tests/integration/test_category_splits.py`, which also settles the contract
    # (the web form's `{category_id: amount}` object, not the legacy service's
    # `category_splits_data` JSON string of a list, which no client ever sent).
    #
    # `has_category_splits` stays listed, and this is the one entry that is
    # **deliberately permanent**. It is not dropped through neglect: it is *derived*
    # from whether split rows are present, and must never be taken from the client.
    # `budget.py:92` skips a flagged expense so its split rows can be attributed
    # instead, so a caller who could set the flag with no rows would make the
    # spending invisible to every budget. Pinned by
    # `test_the_flag_is_derived_from_the_rows_not_taken_from_the_client`.
    'has_category_splits',
}


def _seed(user):
    account = Account(name='Checking', type='checking', balance=100.0,
                      user_id=user.id, currency_code='USD')
    category = Category(name='Food', user_id=user.id)
    db.session.add_all([account, category])
    db.session.commit()
    return account, category


def test_the_fields_web_sends_are_either_honoured_or_listed_as_dropped(
        client, db, auth_headers):
    """The invariant. Fails if a new field is added to either side without a
    decision being recorded here."""
    from schemas.input_schemas import transaction_input

    accepted = set(transaction_input.fields)
    unaccounted = WEB_PAYLOAD_FIELDS - accepted - KNOWN_DROPPED
    assert not unaccounted, (
        'web-ui sends these and TransactionInput does not accept them, so they '
        'are silently dropped with a 201. Wire them up, or add them to '
        'KNOWN_DROPPED with a reason: %s' % sorted(unaccounted))

    resolved = KNOWN_DROPPED & accepted
    assert not resolved, (
        'these are listed as dropped but TransactionInput now accepts them — '
        'remove them from KNOWN_DROPPED: %s' % sorted(resolved))


def test_the_payload_web_actually_builds_is_accepted_and_stored(
        client, db, auth_headers):
    """The full shape `AddTransactionForm` sends with everything filled in.

    Asserted against the database, not the status code — a 201 that dropped half
    the payload is the exact failure this suite exists for.
    """
    user = UserFactory()
    account, category = _seed(user)

    resp = client.post('/api/v1/transactions', headers=auth_headers(user), json={
        'description': 'Groceries',
        'amount': 42.5,
        'date': '2026-08-05',
        'transaction_type': 'expense',
        'currency_code': 'USD',
        'notes': 'weekly shop',
        'category_id': category.id,
        'account_id': account.id,
    })
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]

    row = Expense.query.filter_by(description='Groceries').first()
    assert row is not None
    assert row.amount == 42.5
    assert row.currency_code == 'USD'
    assert row.notes == 'weekly shop'
    assert row.category_id == category.id
    assert row.account_id == account.id
    assert row.transaction_type == 'expense'
    assert row.date.date() == datetime(2026, 8, 5).date()


def test_a_create_with_every_optional_omitted_still_works(
        client, db, auth_headers):
    """The common case, and the one the validation swap most endangered.

    An unselected `<select>` yields `''`, which `fields.Int` rejects. The form
    omits the key instead — this pins that the server is happy with the omission,
    so nobody 'helpfully' makes those fields required.
    """
    user = UserFactory()

    resp = client.post('/api/v1/transactions', headers=auth_headers(user), json={
        'description': 'Cash coffee',
        'amount': 3.0,
        'date': '2026-08-05',
        'transaction_type': 'expense',
        'currency_code': 'USD',
        'notes': '',
    })
    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]

    row = Expense.query.filter_by(description='Cash coffee').first()
    assert row is not None
    assert row.category_id is None
    assert row.account_id is None


def test_every_transaction_type_the_form_offers_is_accepted(
        client, db, auth_headers):
    """`transaction_type` is the one form value validated by `OneOf`, and the
    form's select offers three."""
    user = UserFactory()
    account, _ = _seed(user)

    for kind in ('expense', 'income', 'transfer'):
        resp = client.post('/api/v1/transactions', headers=auth_headers(user),
                           json={
            'description': 'A %s' % kind,
            'amount': 9.0,
            'date': '2026-08-05',
            'transaction_type': kind,
            'currency_code': 'USD',
            'account_id': account.id,
        })
        assert resp.status_code == 201, (
            '%s rejected: %s' % (kind, resp.get_data(as_text=True)[:200]))
        row = Expense.query.filter_by(description='A %s' % kind).first()
        assert row is not None and row.transaction_type == kind
