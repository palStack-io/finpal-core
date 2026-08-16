"""
A SimpleFin sync must actually write transactions.

*** THE DEFECT THIS PINS. *** `sync_account` called
`process_raw_accounts([account_raw])` -- a **list** -- while `process_raw_accounts`
begins `if not raw_data or 'accounts' not in raw_data: return []`, which on a list
asks whether the *string* `'accounts'` is an *element* of it. It never is. So the
method returned `[]` for every account on every sync, `sync_account` took its
`if not processed_list` branch, and answered:

    (True, 'No data returned', 0)

**True.** Not an error. `sync_all_accounts` then summed those zeroes, returned
`True` unconditionally, and the API answered `{'success': true, 'message':
'Synced 0 total transaction(s)'}`. Both the Sync button and the nightly
`scheduled_simplefin_sync` cron ran this, so from 2026-04-12 no SimpleFin
transaction had ever reached the database and nothing anywhere said so. The import
path was unaffected -- it passes the dict -- which is why balances appeared and made
the feature look connected and working.

This is D-110's shape one layer out: the connect defect stored a credential that
could never sync, and this one made sure that even a good credential synced nothing.

The fixture below is copied from a live Bridge response (keys, string amounts,
epoch `posted`, the lot), because D-107 was a fixture that sent three keys the API
never sends and both gates called the resulting `$NaN` page clean.
"""

from unittest.mock import patch

from src.models.account import Account, SimpleFin
from src.models.transaction import Expense
from src.services.account.service import SimpleFinService
from tests.factories import UserFactory

# Shape captured from beta-bridge.simplefin.org, not invented.
RAW = {
    'accounts': [{
        'id': 'Demo Savings',
        'name': 'SimpleFIN Savings',
        'currency': 'USD',
        'balance': '115245.51',
        'available-balance': '115245.51',
        'balance-date': 1786924800,
        'org': {
            'domain': 'beta-bridge.simplefin.org',
            'name': 'SimpleFIN Demo',
            'sfin-url': 'https://beta-bridge.simplefin.org/simplefin',
            'url': 'https://beta-bridge.simplefin.org',
            'id': 'simplefin-demo',
        },
        'transactions': [
            {
                'id': '1786867200',
                'posted': 1786867200,
                'amount': '-80.00',
                'description': 'Fishing bait',
                'payee': "John's Fishin Shack",
                'memo': 'JOHNS FISHIN SHACK BAIT',
                'transacted_at': 1786867200,
                'mcc': '5812',
            },
            {
                'id': '1786780800',
                'posted': 1786780800,
                'amount': '2500.00',
                'description': 'Paycheck',
                'payee': 'ACME Corp',
                'memo': 'DIRECT DEPOSIT',
                'transacted_at': 1786780800,
            },
        ],
    }]
}


def _connected_account(user):
    """A user with a SimpleFin credential and one imported account, as after import."""
    from src.extensions import db

    db.session.add(SimpleFin(
        user_id=user.id,
        access_url='https://demo:demo@beta-bridge.simplefin.org/simplefin',
    ))
    account = Account(
        name='SimpleFIN Savings',
        type='savings',
        institution='SimpleFIN Demo',
        balance=0,
        currency_code='USD',
        import_source='simplefin',
        external_id='Demo Savings',
        user_id=user.id,
    )
    db.session.add(account)
    db.session.commit()
    return account


def test_a_sync_writes_the_transactions_it_fetched(db):
    """
    The whole point of the feature: money that exists at the bank ends up in the app.

    Asserted on `Expense` rows, never on the return value -- the defect this replaces
    returned `(True, ..., 0)`, so a success-flag assertion passes against broken code.
    """
    user = UserFactory()
    account = _connected_account(user)

    with patch('integrations.simplefin.client.SimpleFin.get_accounts_with_transactions',
               return_value=RAW):
        success, message, count = SimpleFinService().sync_account(account.id, user.id)

    assert success, message
    landed = Expense.query.filter_by(user_id=user.id, import_source='simplefin').all()
    assert len(landed) == 2, (
        f'2 transactions were fetched, {len(landed)} were written -- message was {message!r}')
    assert count == 2, f'reported {count} imported, wrote {len(landed)}'

    by_description = {e.description: e for e in landed}
    assert 'Fishing bait' in by_description, sorted(by_description)
    spend = by_description['Fishing bait']
    assert spend.amount == 80.0, f'a -80.00 charge became {spend.amount!r}'
    assert spend.transaction_type == 'expense'
    assert spend.account_id == account.id, 'the transaction is not linked to its account'

    income = by_description['Paycheck']
    assert income.transaction_type == 'income', (
        'a positive amount must not be filed as an expense -- that is D-52 verbatim')


def test_a_second_sync_does_not_duplicate_what_it_already_has(db):
    """
    Dedupe is what makes the nightly cron safe to run 365 times a year.

    It is keyed on `external_id`, and nothing exercised it while the sync wrote
    nothing at all -- a dedupe check over an empty table always passes.
    """
    user = UserFactory()
    account = _connected_account(user)

    with patch('integrations.simplefin.client.SimpleFin.get_accounts_with_transactions',
               return_value=RAW):
        SimpleFinService().sync_account(account.id, user.id)
        _, _, second = SimpleFinService().sync_account(account.id, user.id)

    assert second == 0, f'the second sync re-imported {second} transaction(s)'
    assert Expense.query.filter_by(import_source='simplefin').count() == 2, (
        'a repeat sync duplicated transactions')


def test_the_first_sync_after_an_import_fetches_full_history(db):
    """
    Importing an account must not claim its transactions are already up to date.

    *** FOUND ON A REAL BANK ACCOUNT, INVISIBLE ON THE DEMO ONE. ***
    `import_simplefin_accounts` fetches with `days_back=1` and writes **no**
    transactions -- it only wants current balances. It nevertheless stamped
    `last_sync = utcnow()` on every account it touched. `sync_account` then reads
    that stamp:

        days_since = (utcnow - last_sync).days   # 0
        days_back  = max(days_since + 2, 3)      # 3

    So the first sync a new user ever runs looks back **three days** instead of
    thirty, over a window in which nothing was ever imported. Measured against
    Bridge's demo account: 18 transactions written where 57 were on offer. Against
    a real bank account whose last three days happened to be quiet: **zero**, with
    25 accounts imported, correct balances shown, and `success: true` -- a user
    connects their bank, sees every account appear, and finds no transactions.

    The demo account hides this because its transactions are generated relative to
    today, so a 3-day window always catches some. That is why this survived a green
    live end-to-end test against Bridge.

    `last_sync` means "transactions are synced up to here". Import syncs none, so
    it has no business setting it.
    """
    from src.extensions import db as _db

    user = UserFactory()
    _db.session.add(SimpleFin(
        user_id=user.id,
        access_url='https://demo:demo@beta-bridge.simplefin.org/simplefin',
    ))
    _db.session.commit()

    captured = {}

    def _capture(self, access_url, days_back=30):
        captured['days_back'] = days_back
        return RAW

    # Drive the REAL import rather than simulating what it leaves behind. Hand-setting
    # `last_sync` here would pin the simulation instead of the contract, and would go
    # on passing if import started stamping it again.
    with patch('integrations.simplefin.client.SimpleFin.get_accounts_with_transactions',
               _capture):
        ok, message, _ = SimpleFinService().import_simplefin_accounts(
            user.id, ['Demo Savings'])
        assert ok, message

        account = Account.query.filter_by(external_id='Demo Savings').one()
        assert account.last_sync is None, (
            'import stamped last_sync for a fetch that imported no transactions')

        SimpleFinService().sync_account(account.id, user.id)

    assert captured['days_back'] >= 30, (
        f'the first sync looked back only {captured["days_back"]} days, so a new '
        f'user gets almost none of their history')


def test_an_established_account_still_syncs_incrementally(db):
    """
    The counterpart: once transactions HAVE been synced, the narrow window is the
    point -- it is what keeps the nightly cron cheap. Fixing the case above by
    always fetching 30 days would trade one defect for a slower one.
    """
    from datetime import datetime, timedelta

    user = UserFactory()
    account = _connected_account(user)
    _sync_an_expense_so_the_account_has_history(user, account)
    account.last_sync = datetime.utcnow() - timedelta(days=4)
    from src.extensions import db as _db
    _db.session.commit()

    captured = {}

    def _capture(self, access_url, days_back=30):
        captured['days_back'] = days_back
        return RAW

    with patch('integrations.simplefin.client.SimpleFin.get_accounts_with_transactions',
               _capture):
        SimpleFinService().sync_account(account.id, user.id)

    assert captured['days_back'] == 6, (
        f'an account synced 4 days ago should fetch 4+2 days, got {captured["days_back"]}')


def _sync_an_expense_so_the_account_has_history(user, account):
    """Give the account one already-synced transaction, as a real sync would."""
    from datetime import datetime
    from src.extensions import db as _db
    _db.session.add(Expense(
        description='Previously synced', amount=1.0, original_amount=1.0,
        currency_code='USD', date=datetime(2026, 7, 1), card_used=account.name,
        transaction_type='expense', split_method='equal', split_value=0,
        paid_by=user.id, user_id=user.id, account_id=account.id,
        external_id='already-here', import_source='simplefin',
    ))
    _db.session.commit()


def test_sync_all_reports_failure_when_every_account_failed(db):
    """
    `sync_all_accounts` returned `True` unconditionally, so a total failure and a
    clean run were indistinguishable to the caller -- which is precisely why the
    zero-transaction sync went unnoticed for four months. The per-account results
    carried the truth and nothing read them.
    """
    user = UserFactory()
    _connected_account(user)

    with patch('integrations.simplefin.client.SimpleFin.get_accounts_with_transactions',
               return_value=None):
        success, message, results = SimpleFinService().sync_all_accounts(user.id)

    assert results, 'no per-account results were reported'
    assert all(not r['success'] for r in results), results
    assert not success, (
        'every account failed to sync and the call still reported overall success')
