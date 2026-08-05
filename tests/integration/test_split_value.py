"""`split_value` decides the payer's share of a percentage or custom split.

The column carries a `# deprecated - kept for backward compatibility` comment,
which is wrong: `Expense.calculate_splits` reads it in both non-`equal` branches.
For `split_method='percentage'` it is the payer's **percent** of the total
(`transaction.py:183`), and for `split_method='custom'` it is the payer's
**absolute amount** (`transaction.py:238`). Both branches fall back to `0` when it
is `None`.

It was absent from `TransactionInput`, so `validate_request` dropped it with a 201
even though `AddTransactionForm` collects it and sends it whenever the split method
is not `equal` (`AddTransactionForm.tsx:127-128`). The effect was not a missing
field but a wrong division: the payer's share computed as **zero**, and the entire
amount spread across the other participants. The legacy service could not have
saved it either — it passed `split_value=0` as a literal when building the Expense.

Assertions are on `calculate_splits()` output, since that is the number a user sees
attributed to them, rather than on the stored column alone.
"""
from src.extensions import db
from src.models.transaction import Expense
from tests.factories import UserFactory


def _create(client, user, auth_headers, **fields):
    payload = dict(description='Split me', amount=100.0, date='2026-08-05',
                   transaction_type='expense', currency_code='USD')
    payload.update(fields)
    return client.post('/api/v1/transactions', headers=auth_headers(user),
                       json=payload)


def test_a_percentage_split_stores_the_payers_percentage(
        client, db, auth_headers):
    payer = UserFactory()
    other = UserFactory()

    resp = _create(client, payer, auth_headers, split_method='percentage',
                   split_value=40.0, split_with=other.id)

    assert resp.status_code == 201, resp.get_data(as_text=True)[:300]
    row = Expense.query.filter_by(description='Split me').first()
    assert row.split_value == 40.0, (
        'split_value was accepted with a 201 and dropped, so the payer share '
        'computes as 0%% and the whole amount lands on everyone else')


def test_a_percentage_split_attributes_the_payer_their_share(
        client, db, auth_headers):
    """The number a user actually sees."""
    payer = UserFactory()
    other = UserFactory()

    _create(client, payer, auth_headers, split_method='percentage',
            split_value=40.0, split_with=other.id)

    row = Expense.query.filter_by(description='Split me').first()
    splits = row.calculate_splits()

    assert splits['payer']['amount'] == 40.0, (
        "the payer's 40%% of 100.00 came out as %s"
        % splits['payer']['amount'])
    assert splits['splits'][0]['amount'] == 60.0, (
        'the remaining 60.00 should go to the one other participant, got %s'
        % splits['splits'][0]['amount'])


def test_a_custom_split_treats_the_value_as_an_amount(client, db, auth_headers):
    payer = UserFactory()
    other = UserFactory()

    _create(client, payer, auth_headers, split_method='custom',
            split_value=25.0, split_with=other.id)

    row = Expense.query.filter_by(description='Split me').first()
    assert row.split_value == 25.0
    splits = row.calculate_splits()
    assert splits['payer']['amount'] == 25.0
    assert splits['splits'][0]['amount'] == 75.0


def test_a_percentage_over_100_is_refused(client, db, auth_headers):
    """A percentage above 100 makes the remainder negative, so other participants
    are credited money by an expense."""
    payer = UserFactory()
    other = UserFactory()

    resp = _create(client, payer, auth_headers, split_method='percentage',
                   split_value=150.0, split_with=other.id)

    assert resp.status_code == 400, (
        'accepted a 150%% payer share; got %s' % resp.status_code)
    assert Expense.query.filter_by(description='Split me').first() is None


def test_a_negative_split_value_is_refused(client, db, auth_headers):
    payer = UserFactory()
    other = UserFactory()

    resp = _create(client, payer, auth_headers, split_method='percentage',
                   split_value=-10.0, split_with=other.id)

    assert resp.status_code == 400
    assert Expense.query.filter_by(description='Split me').first() is None


def test_a_custom_amount_above_the_total_is_refused(client, db, auth_headers):
    """For `custom` the value is absolute, so exceeding the total has the same
    effect as a percentage over 100."""
    payer = UserFactory()
    other = UserFactory()

    resp = _create(client, payer, auth_headers, split_method='custom',
                   split_value=250.0, amount=100.0, split_with=other.id)

    assert resp.status_code == 400
    assert Expense.query.filter_by(description='Split me').first() is None


def test_an_equal_split_ignores_split_value(client, db, auth_headers):
    """`calculate_splits` never reads it for `equal`, so accepting a value there
    would store a number that changes nothing — refuse it rather than mislead.

    The web form matches this: it only sends the field when the method is not
    `equal` (`AddTransactionForm.tsx:127`).
    """
    payer = UserFactory()
    other = UserFactory()

    resp = _create(client, payer, auth_headers, split_method='equal',
                   split_value=40.0, split_with=other.id)

    assert resp.status_code == 400, (
        'accepted a split_value on an equal split, where it is never read; '
        'got %s' % resp.status_code)


def test_split_value_survives_into_the_response(client, db, auth_headers):
    payer = UserFactory()
    other = UserFactory()

    resp = _create(client, payer, auth_headers, split_method='percentage',
                   split_value=40.0, split_with=other.id)

    assert resp.get_json()['transaction']['split_value'] == 40.0
