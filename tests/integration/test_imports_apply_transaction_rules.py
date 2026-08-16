"""
A user's transaction rules must apply to IMPORTED transactions, not only typed ones.

*** THE DEFECT. *** finPal has two categorisers and they are not the same one:

  - `apply_transaction_rules` (`src/utils/rule_engine.py`) reads `transaction_rules`.
    This is the live one -- it is what the Rules screen writes, and the demo seed
    creates **52 rules per user**. It runs from exactly one place:
    `services/transaction/creation.py:287`, i.e. normal transaction creation.
  - `auto_categorize_transaction` (`src/utils/helpers.py`) reads `category_mappings`.
    This is what **both import paths** call -- CSV import and SimpleFin sync.

`category_mappings` holds **zero rows for every user on both deployed stacks**,
including the four demo users who have 52 transaction rules apiece. It is legacy and
unreachable: `CategoryMapping` appears in the API only in *delete* paths, no endpoint
creates one, and neither web-ui nor mobile mentions it. So the import path's
categoriser cannot return anything but `None`, for anybody, ever.

The measured consequence, on the demo stack: of 6 CSV-imported expenses, **0 have a
category**, while 79 of 93 seeded ones do.

So a user builds rules, watches them work on transactions they type in, connects a
bank -- and every imported transaction lands uncategorised. Which is backwards:
imports are the case rules exist for.

These tests pin the rule engine reaching both import paths. They do NOT assert that
`auto_categorize_transaction` is gone -- it stays as a fallback, harmless while its
table is empty and still correct for any install that has rows in it.
"""

import io
from datetime import datetime, timedelta
from unittest.mock import patch

from src.extensions import db
from src.models.account import Account, SimpleFin
from src.models.category import Category
from src.models.transaction import Expense
from src.models.transaction_rule import TransactionRule
from src.services.account.service import AccountService, SimpleFinService
from tests.factories import UserFactory


def _user_with_a_rule():
    """A user who has done the thing the Rules screen invites them to do."""
    user = UserFactory()
    category = Category(name='Groceries', user_id=user.id)
    db.session.add(category)
    db.session.commit()

    db.session.add(TransactionRule(
        user_id=user.id,
        name='Fishing to Groceries',
        pattern='Fishing',
        pattern_field='description',
        auto_category_id=category.id,
        priority=10,
        active=True,
    ))
    db.session.commit()
    return user, category


def _simplefin_payload(description='Fishing bait', n=3):
    return {'accounts': [{
        'id': 'acct-1', 'name': 'Checking', 'currency': 'USD', 'balance': '100.00',
        'balance-date': 1786924800,
        'org': {'name': 'X', 'domain': 'x', 'url': 'https://x', 'id': 'x',
                'sfin-url': 'https://x'},
        'transactions': [
            {'id': f'txn-{i}',
             'posted': int((datetime.utcnow() - timedelta(days=i * 7)).timestamp()),
             'amount': '-80.00', 'description': description,
             'payee': "John's Fishin Shack", 'memo': 'BAIT'}
            for i in range(n)
        ],
    }]}


def test_the_rule_engine_itself_works(db):
    """
    A control. If this fails the other two tests are meaningless, because they would
    be measuring a broken engine rather than an unreached one.
    """
    from src.utils.rule_engine import apply_transaction_rules

    user, category = _user_with_a_rule()
    out = apply_transaction_rules({'description': 'Fishing bait', 'amount': 80.0}, user.id)
    assert str(out.get('category_id')) == str(category.id), out


def test_simplefin_synced_transactions_get_the_users_rules(db):
    """Bank sync is the case transaction rules exist for."""
    user, category = _user_with_a_rule()
    db.session.add(SimpleFin(user_id=user.id, access_url='https://d:d@x/simplefin'))
    account = Account(name='Checking', type='checking', institution='X', balance=0,
                      currency_code='USD', import_source='simplefin',
                      external_id='acct-1', user_id=user.id)
    db.session.add(account)
    db.session.commit()

    with patch('integrations.simplefin.client.SimpleFin.get_accounts_with_transactions',
               return_value=_simplefin_payload()):
        ok, message, count = SimpleFinService().sync_account(account.id, user.id)
    assert ok, message
    assert count == 3, message

    synced = Expense.query.filter_by(import_source='simplefin').all()
    uncategorised = [e for e in synced if e.category_id is None]
    assert not uncategorised, (
        f'{len(uncategorised)} of {len(synced)} synced transactions have no category, '
        f'though a rule matches every one of them')
    assert all(str(e.category_id) == str(category.id) for e in synced)


def test_csv_imported_transactions_get_the_users_rules(db):
    """
    The same gap on the other import path.

    Measured on the demo stack before the fix: 0 of 6 CSV-imported expenses carried a
    category.
    """
    user, category = _user_with_a_rule()

    csv_text = (
        'Date,Description,Amount\n'
        '2026-08-01,Fishing bait,80.00\n'
        '2026-08-08,Fishing bait,80.00\n'
    )
    ok, message, imported_count, _skipped = AccountService().import_csv(
        user.id, io.BytesIO(csv_text.encode()))
    assert ok, message

    imported = Expense.query.filter_by(import_source='csv').all()
    assert imported, f'no CSV rows were imported: {message} ({imported_count})'
    uncategorised = [e for e in imported if e.category_id is None]
    assert not uncategorised, (
        f'{len(uncategorised)} of {len(imported)} CSV-imported transactions have no '
        f'category, though a rule matches every one of them')


def test_an_explicit_category_in_the_import_still_wins(db):
    """
    A rule must not overwrite a category the data already carries. The rule engine is
    a fallback for *uncategorised* rows, which is how transaction creation uses it
    (`creation.py` only calls it when `category_id` is absent).
    """
    user, category = _user_with_a_rule()
    other = Category(name='Hobbies', user_id=user.id)
    db.session.add(other)
    db.session.commit()

    csv_text = (
        'Date,Description,Amount,Category\n'
        '2026-08-01,Fishing bait,80.00,Hobbies\n'
    )
    ok, message, _count, _skipped = AccountService().import_csv(
        user.id, io.BytesIO(csv_text.encode()))
    assert ok, message

    row = Expense.query.filter_by(import_source='csv').one()
    assert str(row.category_id) == str(other.id), (
        'the rule overwrote a category the CSV specified explicitly')
